import type { ListPostsQuery, PostPageDto, PostSort, PostSortDirection, PostView } from '@alexeev/contracts';
import { getPostsByIds } from '../modules/content';
import type { Container } from './container';
import { AppError } from '../shared/app-error';
import { ARCHIVE_RETENTION_MS } from '../shared/archive-retention';
import { sha256Hex } from '../platform/security/sha256';

interface Cursor {
  view: PostView;
  sort: PostSort;
  direction: PostSortDirection;
  queryHash: string;
  status: 'draft' | 'approved' | null;
  id: string;
}

interface ListRow {
  id: string | null;
  sort_key: number | string | null;
  total_count: number;
  archived_count: number;
}

const SORT_SQL: Record<PostSort, string> = {
  title: 'p.title_sort_key',
  updated: 'p.updated_at',
  sentAt: 'pf.last_sent_at',
  left: `p.archived_at + ${ARCHIVE_RETENTION_MS}`
};

function cursorEncode(cursor: Cursor): string {
  const bytes = new TextEncoder().encode(JSON.stringify(cursor));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function cursorDecode(raw: string, expected: Omit<Cursor, 'id'>): Cursor | null {
  try {
    const binary = atob(raw.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (raw.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
    if (typeof value !== 'object' || value === null) return null;
    const cursor = value as Partial<Cursor>;
    if (
      cursor.view !== expected.view ||
      cursor.sort !== expected.sort ||
      cursor.direction !== expected.direction ||
      cursor.queryHash !== expected.queryHash ||
      cursor.status !== expected.status ||
      typeof cursor.id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(cursor.id)
    )
      return null;
    return cursor as Cursor;
  } catch {
    return null;
  }
}

function publicationStateSql(): string {
  return `CASE
    WHEN p.archived_at IS NOT NULL THEN '\u0443\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043d'
    WHEN EXISTS (SELECT 1 FROM publications pu JOIN jobs j ON j.publication_id = pu.id AND j.kind = 'publish'
                 WHERE pu.post_id = p.id AND j.status = 'unknown') THEN '\u043d\u0443\u0436\u043d\u0430 \u0441\u0432\u0435\u0440\u043a\u0430'
    WHEN EXISTS (SELECT 1 FROM publications pu JOIN jobs j ON j.publication_id = pu.id AND j.kind = 'publish'
                 WHERE pu.post_id = p.id AND j.status = 'claimed') THEN '\u043e\u0442\u043f\u0440\u0430\u0432\u043b\u044f\u0435\u0442\u0441\u044f'
    WHEN EXISTS (SELECT 1 FROM publications pu JOIN jobs j ON j.publication_id = pu.id AND j.kind = 'publish'
                 WHERE pu.post_id = p.id AND j.status IN ('pending', 'retry_wait')) THEN '\u0437\u0430\u043f\u043b\u0430\u043d\u0438\u0440\u043e\u0432\u0430\u043d'
    WHEN p.status = 'approved' THEN '\u0443\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043d'
    ELSE '\u0447\u0435\u0440\u043d\u043e\u0432\u0438\u043a' END`;
}

function unicodeCaseFoldSql(column: string, query: string): string {
  let expression = `lower(${column})`;
  const uppercaseCharacters = new Set<string>();
  for (const character of query) {
    const uppercase = character.toLocaleUpperCase('ru');
    if ([...uppercase].length === 1 && uppercase !== character) uppercaseCharacters.add(uppercase);
  }
  for (const uppercase of uppercaseCharacters)
    expression = `replace(${expression}, '${uppercase}', '${uppercase.toLocaleLowerCase('ru')}')`;
  return expression;
}

export function buildPostsListSql(
  query: ListPostsQuery,
  cursor: Cursor | null = null
): { sql: string; bindings: (string | number)[] } {
  const view = query.view;
  const sort = query.sort ?? (view === 'archive' ? 'left' : 'updated');
  const direction = query.direction ?? 'descending';
  const order = direction === 'ascending' ? 'ASC' : 'DESC';
  const live = view === 'live';
  const q = query.q?.toLocaleLowerCase('ru') ?? '';
  const match = `"${q.replaceAll('"', '""')}"`;
  const shortSearch = [...q].length < 3;
  const sortExpr = SORT_SQL[sort];
  const stateExpr = publicationStateSql();
  const autoDelete = `CASE WHEN p.archived_at IS NULL THEN NULL ELSE p.archived_at + ${ARCHIVE_RETENTION_MS} END`;
  const filters = [live ? 'p.archived_at IS NULL' : 'p.archived_at IS NOT NULL'];
  const bindings: (string | number)[] = [];
  if (query.status !== undefined) {
    filters.push('p.status = ?');
    bindings.push(query.status);
  }
  if (q !== '') {
    const postTextMatch = shortSearch
      ? `instr(${unicodeCaseFoldSql('p.title', q)}, ?) > 0 OR instr(${unicodeCaseFoldSql('p.body', q)}, ?) > 0`
      : `p.rowid IN (SELECT rowid FROM posts_search WHERE posts_search MATCH ?)`;
    const channelMatch = shortSearch
      ? `EXISTS (SELECT 1 FROM destinations d JOIN publications pu ON pu.destination_id = d.id
                JOIN jobs j ON j.publication_id = pu.id AND j.kind = 'publish'
                WHERE pu.post_id = p.id AND j.status NOT IN ('failed', 'cancelled')
                  AND instr(${unicodeCaseFoldSql('d.title', q)}, ?) > 0)`
      : `EXISTS (SELECT 1 FROM publications pu JOIN jobs j ON j.publication_id = pu.id AND j.kind = 'publish'
                JOIN destinations d ON d.id = pu.destination_id
                WHERE pu.post_id = p.id AND j.status NOT IN ('failed', 'cancelled')
                  AND d.rowid IN (SELECT rowid FROM destinations_search WHERE destinations_search MATCH ?))`;
    filters.push(`(${postTextMatch} OR instr(${stateExpr}, ?) > 0 OR ${channelMatch})`);
    if (shortSearch) bindings.push(q, q, q, q);
    else bindings.push(match, q, match);
  }
  const comparison = direction === 'ascending' ? '>' : '<';
  const cursorSql =
    cursor === null
      ? ''
      : ` AND (
      selected.sort_null > cursor_position.sort_null OR (selected.sort_null = cursor_position.sort_null AND (
      (cursor_position.sort_null = 1 AND selected.id ${comparison} ?) OR
      (cursor_position.sort_null = 0 AND (selected.sort_key ${comparison} cursor_position.sort_key OR (selected.sort_key = cursor_position.sort_key AND selected.id ${comparison} ?)))
    ))
  )`;
  if (cursor !== null) bindings.push(cursor.id, cursor.id, cursor.id);
  bindings.push(query.limit + 1);
  const sql = `WITH publication_facts AS (
      SELECT pu.post_id, MAX(CASE WHEN j.status = 'succeeded' THEN j.updated_at END) AS last_sent_at
      FROM publications pu JOIN jobs j ON j.publication_id = pu.id AND j.kind = 'publish'
      GROUP BY pu.post_id
    ), selected AS (
      SELECT p.id, p.title, p.body, p.status, p.updated_at, p.archived_at,
             ${autoDelete} AS auto_delete_at, pf.last_sent_at, ${stateExpr} AS display_state,
             ${sortExpr} AS sort_key, CASE WHEN ${sortExpr} IS NULL THEN 1 ELSE 0 END AS sort_null
      FROM posts p LEFT JOIN publication_facts pf ON pf.post_id = p.id
      WHERE ${filters.join(' AND ')}
    )${
      cursor === null
        ? ''
        : `, cursor_position AS (
      SELECT ${sortExpr} AS sort_key, CASE WHEN ${sortExpr} IS NULL THEN 1 ELSE 0 END AS sort_null
      FROM posts p LEFT JOIN publication_facts pf ON pf.post_id = p.id
      WHERE p.id = ?
    )`
    }, page AS (
      SELECT selected.* FROM selected${cursor === null ? '' : ' CROSS JOIN cursor_position'} WHERE 1 = 1${cursorSql}
      ORDER BY sort_null ASC, sort_key ${order}, id ${order} LIMIT ?
    )
    SELECT page.id, page.sort_key, (SELECT count(*) FROM selected) AS total_count,
           (SELECT count(*) FROM posts WHERE archived_at IS NOT NULL) AS archived_count
    FROM (SELECT 1) AS anchor LEFT JOIN page ON 1 = 1 ORDER BY page.sort_null ASC, page.sort_key ${order}, page.id ${order}`;
  return { sql, bindings };
}

export async function listPostsFromApp(
  deps: { container: Container; db: D1Database; now: number },
  query: ListPostsQuery
): Promise<PostPageDto> {
  const view = query.view;
  const sort = query.sort ?? (view === 'archive' ? 'left' : 'updated');
  const direction = query.direction ?? 'descending';
  const expected = { view, sort, direction, queryHash: await sha256Hex(query.q ?? ''), status: query.status ?? null };
  const cursor = query.cursor === undefined ? null : cursorDecode(query.cursor, expected);
  if (query.cursor !== undefined && cursor === null)
    throw new AppError('VALIDATION_ERROR', 'Invalid cursor', { field: 'cursor' });
  const { sql, bindings } = buildPostsListSql(query, cursor);
  return (async () => {
    const { results } = await deps.db
      .prepare(sql)
      .bind(...bindings)
      .all<ListRow>();
    const rows = results.filter((row): row is ListRow & { id: string } => row.id !== null);
    const page = rows.slice(0, query.limit);
    const ids = page.map((row) => row.id);
    const posts = await getPostsByIds(
      { repo: deps.container.posts, summaries: deps.container.postSummaries, now: deps.now },
      ids
    );
    const last = page.at(-1);
    const lastCursor =
      rows.length > query.limit && last !== undefined ? cursorEncode({ ...expected, id: last.id }) : null;
    const first = results[0];
    return {
      items: posts,
      nextCursor: lastCursor,
      totalCount: first?.total_count ?? 0,
      archivedCount: first?.archived_count ?? 0
    };
  })();
}
