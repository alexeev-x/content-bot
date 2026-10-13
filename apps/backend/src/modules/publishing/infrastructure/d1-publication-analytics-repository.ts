import {
  mediaKindSchema,
  publicationAnalyticsGroupSchema,
  publicationAnalyticsReportSchema,
  publicationAnalyticsRowSchema,
  type PublicationAnalyticsQuery,
  type PublicationAnalyticsReportDto
} from '@alexeev/contracts';
import { z } from 'zod';
import { AppError } from '../../../shared/app-error';
import type { PublicationAnalyticsRepository } from '../application/ports';

type SqlValue = string | number;

interface CountRow {
  publications: number;
  sent: number;
  failed: number;
  unknown: number;
  attempts: number;
  retries: number;
}

interface GroupRow extends CountRow {
  key: string;
  label: string;
  covered_publications: number;
  unrecorded_publications: number;
}

interface SnapshotRow {
  publication_id: string;
  post_id: string;
  post_revision: number;
  title: string;
  outcome: 'sent' | 'failed' | 'unknown';
  observed_at: number;
  destination_id: string;
  destination_title: string | null;
  media_kinds: string | null;
  attempt_count: number;
  retry_count: number;
}

interface CoverageRow {
  recorded: number;
  unrecorded: number;
}

function queryWhere(query: PublicationAnalyticsQuery, includeOutcome: boolean): { sql: string; bindings: SqlValue[] } {
  const clauses = ['s.outcome IS NOT NULL'];
  const bindings: SqlValue[] = [];
  const bind = (value: SqlValue) => {
    bindings.push(value);
    return bindings.length + 3;
  };
  if (query.destinationId !== undefined) clauses.push(`s.destination_id = ?${bind(query.destinationId)}`);
  if (includeOutcome && query.outcome !== undefined) clauses.push(`s.outcome = ?${bind(query.outcome)}`);
  if (query.mediaKind !== undefined) {
    const parameter = bind(query.mediaKind);
    clauses.push(`EXISTS (SELECT 1 FROM json_each(s.media_kinds) mk WHERE mk.value = ?${parameter})`);
  }
  return { sql: clauses.join(' AND '), bindings };
}

function encodeCursor(asOf: number, observedAt: number, publicationId: string): string {
  return btoa(`${asOf}|${observedAt}|${publicationId}`).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function decodeCursor(value: string | undefined): { asOf: number; observedAt: number; publicationId: string } | null {
  if (value === undefined) return null;
  try {
    const decoded = atob(value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4));
    const [asOfRaw, observedAtRaw, publicationId] = decoded.split('|');
    const asOf = Number(asOfRaw);
    const observedAt = Number(observedAtRaw);
    if (
      !Number.isSafeInteger(asOf) ||
      asOf < 0 ||
      !Number.isSafeInteger(observedAt) ||
      observedAt < 0 ||
      publicationId === undefined ||
      !z.uuid().safeParse(publicationId).success
    ) {
      throw new Error('Invalid cursor');
    }
    return { asOf, observedAt, publicationId };
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Invalid analytics cursor');
  }
}

function mediaKindsFromJson(value: string | null): string[] | null {
  if (value === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new AppError('UNAVAILABLE', 'Stored analytics media data is invalid');
  }
  const result = z.array(mediaKindSchema).max(10).safeParse(parsed);
  if (!result.success) throw new AppError('UNAVAILABLE', 'Stored analytics media data is invalid');
  return result.data;
}

function counts(row: CountRow) {
  return {
    publications: row.publications,
    sent: row.sent,
    failed: row.failed,
    unknown: row.unknown,
    attempts: row.attempts,
    retries: row.retries
  };
}

const COUNT_SELECT = `COUNT(*) AS publications,
  COALESCE(SUM(CASE WHEN s.outcome = 'sent' THEN 1 ELSE 0 END), 0) AS sent,
  COALESCE(SUM(CASE WHEN s.outcome = 'failed' THEN 1 ELSE 0 END), 0) AS failed,
  COALESCE(SUM(CASE WHEN s.outcome = 'unknown' THEN 1 ELSE 0 END), 0) AS unknown,
  COALESCE(SUM(s.attempt_count), 0) AS attempts,
  COALESCE(SUM(s.retry_count), 0) AS retries`;

const LATEST_SNAPSHOTS_CTE = `WITH ranked_snapshots AS (
  SELECT analytics_snapshots.*,
         ROW_NUMBER() OVER (PARTITION BY publication_id ORDER BY observed_at DESC, snapshot_id DESC) AS snapshot_rank
  FROM analytics_snapshots
  WHERE observed_at >= ?1 AND observed_at < ?2 AND observed_at <= ?3
), latest_snapshots AS (
  SELECT * FROM ranked_snapshots WHERE snapshot_rank = 1
)`;

export function createD1PublicationAnalyticsRepository(db: D1Database): PublicationAnalyticsRepository {
  return {
    async read(query, observedAt): Promise<PublicationAnalyticsReportDto> {
      const cursor = decodeCursor(query.cursor);
      const asOf = cursor?.asOf ?? observedAt;
      const where = queryWhere(query, true);
      const baseBindings: SqlValue[] = [Date.parse(query.from), Date.parse(query.to), asOf, ...where.bindings];
      const pageBindings = [...baseBindings];
      let cursorSql = '';
      if (cursor !== null) {
        pageBindings.push(cursor.observedAt, cursor.publicationId);
        const observedParameter = pageBindings.length - 1;
        cursorSql = `AND (s.observed_at < ?${observedParameter} OR
          (s.observed_at = ?${observedParameter} AND s.publication_id < ?${pageBindings.length}))`;
      }
      pageBindings.push(query.limit + 1);

      const groupQuery =
        query.comparison === 'destination'
          ? `${LATEST_SNAPSHOTS_CTE} SELECT s.destination_id AS key, COALESCE(s.destination_title, 'Unknown destination') AS label,
             ${COUNT_SELECT}, COUNT(*) AS covered_publications, 0 AS unrecorded_publications
           FROM latest_snapshots s WHERE ${where.sql}
           GROUP BY s.destination_id, s.destination_title ORDER BY label, key LIMIT 101`
          : `${LATEST_SNAPSHOTS_CTE}, expanded AS (
             SELECT s.*, CASE WHEN s.media_kinds IS NULL THEN 'unrecorded'
                              WHEN json_array_length(s.media_kinds) = 0 THEN 'none'
                              ELSE CAST(m.value AS TEXT) END AS media_key
             FROM latest_snapshots s LEFT JOIN (
               SELECT DISTINCT snapshot_id, CAST(value AS TEXT) AS value
               FROM latest_snapshots, json_each(media_kinds)
             ) m ON m.snapshot_id = s.snapshot_id
             WHERE ${where.sql}
           )
           SELECT media_key AS key,
                  CASE media_key WHEN 'photo' THEN 'Photo' WHEN 'video' THEN 'Video'
                    WHEN 'animation' THEN 'Animation' WHEN 'none' THEN 'No media'
                    ELSE 'Media not recorded' END AS label,
                  COUNT(*) AS publications,
                  SUM(CASE WHEN outcome = 'sent' THEN 1 ELSE 0 END) AS sent,
                  SUM(CASE WHEN outcome = 'failed' THEN 1 ELSE 0 END) AS failed,
                  SUM(CASE WHEN outcome = 'unknown' THEN 1 ELSE 0 END) AS unknown,
                  SUM(attempt_count) AS attempts, SUM(retry_count) AS retries,
                  SUM(CASE WHEN media_key = 'unrecorded' THEN 0 ELSE 1 END) AS covered_publications,
                  SUM(CASE WHEN media_key = 'unrecorded' THEN 1 ELSE 0 END) AS unrecorded_publications
           FROM expanded GROUP BY media_key ORDER BY key LIMIT 101`;

      const pageSql = `${LATEST_SNAPSHOTS_CTE} SELECT s.publication_id, s.post_id, s.post_revision, s.title, s.outcome, s.observed_at,
                              s.destination_id, s.destination_title, s.media_kinds, s.attempt_count, s.retry_count
                       FROM latest_snapshots s WHERE ${where.sql} ${cursorSql}
                       ORDER BY s.observed_at DESC, s.publication_id DESC LIMIT ?${pageBindings.length}`;
      const summarySql = `${LATEST_SNAPSHOTS_CTE} SELECT ${COUNT_SELECT} FROM latest_snapshots s WHERE ${where.sql}`;
      const coverageSql = `${LATEST_SNAPSHOTS_CTE} SELECT COALESCE(SUM(CASE WHEN s.media_kinds IS NULL THEN 0 ELSE 1 END), 0) AS recorded,
                                  COALESCE(SUM(CASE WHEN s.media_kinds IS NULL THEN 1 ELSE 0 END), 0) AS unrecorded
                           FROM latest_snapshots s WHERE ${where.sql}`;

      let summaryResult: D1Result<unknown> | undefined;
      let groupsResult: D1Result<unknown> | undefined;
      let pageResult: D1Result<unknown> | undefined;
      let coverageResult: D1Result<unknown> | undefined;
      try {
        [summaryResult, groupsResult, pageResult, coverageResult] = await db.batch([
          db.prepare(summarySql).bind(...baseBindings),
          db.prepare(groupQuery).bind(...baseBindings),
          db.prepare(pageSql).bind(...pageBindings),
          db.prepare(coverageSql).bind(...baseBindings)
        ]);
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError('UNAVAILABLE', 'Publication analytics are unavailable');
      }
      const summary = (summaryResult?.results[0] as CountRow | undefined) ?? {
        publications: 0,
        sent: 0,
        failed: 0,
        unknown: 0,
        attempts: 0,
        retries: 0
      };
      const rows = (pageResult?.results ?? []) as SnapshotRow[];
      const hasNext = rows.length > query.limit;
      const visibleRows = rows.slice(0, query.limit);
      const groupRows = (groupsResult?.results ?? []) as GroupRow[];
      if (groupRows.length > 100) throw new AppError('UNAVAILABLE', 'Publication analytics comparison is too large');
      const groups = groupRows.map((row) =>
        publicationAnalyticsGroupSchema.parse({
          key: row.key,
          label: row.label,
          counts: counts(row),
          coveredPublications: row.covered_publications,
          unrecordedPublications: row.unrecorded_publications
        })
      );
      const publications = visibleRows.map((row) =>
        publicationAnalyticsRowSchema.parse({
          publicationId: row.publication_id,
          postId: row.post_id,
          postRevision: row.post_revision,
          title: row.title,
          outcome: row.outcome,
          observedAt: new Date(row.observed_at).toISOString(),
          destinationId: row.destination_id,
          destinationTitle: row.destination_title,
          mediaKinds: mediaKindsFromJson(row.media_kinds),
          attemptCount: row.attempt_count,
          retryCount: row.retry_count
        })
      );
      const last = visibleRows.at(-1);
      const coverage = (coverageResult?.results[0] as CoverageRow | undefined) ?? { recorded: 0, unrecorded: 0 };
      return publicationAnalyticsReportSchema.parse({
        from: query.from,
        to: query.to,
        observedAt: new Date(asOf).toISOString(),
        comparison: query.comparison,
        summary: counts(summary),
        groups,
        publications: {
          items: publications,
          nextCursor: hasNext && last !== undefined ? encodeCursor(asOf, last.observed_at, last.publication_id) : null
        },
        mediaCoverage: { recorded: coverage.recorded, unrecorded: coverage.unrecorded }
      });
    }
  };
}
