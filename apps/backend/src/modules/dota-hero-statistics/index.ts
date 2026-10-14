import {
  dotaHeroStatisticsErrorSchema,
  dotaHeroStatisticsHealthSchema,
  dotaHeroStatisticsSchema,
  dotaHeroStatisticsSnapshotSchema,
  type DotaHeroBracket,
  type DotaHeroStatisticDto,
  type DotaHeroStatisticsDto
} from '@alexeev/contracts';
import { z } from 'zod';
import { OPENDOTA_HERO_STATS_URL } from '../../integrations/opendota/hero-statistics';
import { AppError } from '../../shared/app-error';
import { clipDetail, describeError, describeHttp, describeShape } from '../../shared/feed-diagnostics';

const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000;
const CLAIM_LEASE_MS = 60_000;
const SNAPSHOT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_RESPONSE_BYTES = 512 * 1024;

const sourceCountSchema = z.number().int().nonnegative().nullable().optional();
const sourceHeroSchema = z
  .object({
    id: z.number().int().positive(),
    localized_name: z.string().trim().min(1).max(120),
    pro_pick: sourceCountSchema,
    pro_win: sourceCountSchema,
    pro_ban: sourceCountSchema,
    '1_pick': sourceCountSchema,
    '1_win': sourceCountSchema,
    '2_pick': sourceCountSchema,
    '2_win': sourceCountSchema,
    '3_pick': sourceCountSchema,
    '3_win': sourceCountSchema,
    '4_pick': sourceCountSchema,
    '4_win': sourceCountSchema,
    '5_pick': sourceCountSchema,
    '5_win': sourceCountSchema,
    '6_pick': sourceCountSchema,
    '6_win': sourceCountSchema,
    '7_pick': sourceCountSchema,
    '7_win': sourceCountSchema,
    '8_pick': sourceCountSchema,
    '8_win': sourceCountSchema
  })
  .passthrough();

const sourceResponseSchema = z.array(sourceHeroSchema).min(1).max(200);

export type DotaHeroStatisticsErrorCode = z.infer<typeof dotaHeroStatisticsErrorSchema>;

/** What the contract's five error codes do not cover: a D1 write failed after a good download. */
const STORE_ERROR_KIND = 'DOTA_HERO_STATS_STORE';

export class DotaHeroStatisticsError extends Error {
  constructor(
    readonly code: DotaHeroStatisticsErrorCode,
    readonly httpStatus: number | null = null,
    readonly detail = ''
  ) {
    super(code);
    this.name = 'DotaHeroStatisticsError';
  }
}

function count(value: number | null | undefined): number | null {
  return value ?? null;
}

function rankedSample(row: z.infer<typeof sourceHeroSchema>, bracket: DotaHeroBracket) {
  return {
    picks: count(row[`${bracket}_pick` as keyof typeof row] as number | null | undefined),
    wins: count(row[`${bracket}_win` as keyof typeof row] as number | null | undefined)
  };
}

function hasWinsAbovePicks(row: z.infer<typeof sourceHeroSchema>): boolean {
  const samples = [
    [row.pro_pick, row.pro_win],
    ...(['1', '2', '3', '4', '5', '6', '7', '8'] as const).map(
      (bracket) => [row[`${bracket}_pick`], row[`${bracket}_win`]] as const
    )
  ];
  return samples.some(
    ([picks, wins]) => picks !== null && picks !== undefined && wins !== null && wins !== undefined && wins > picks
  );
}

/** Validates a complete provider response before mapping it to the bounded stored DTO. */
function parseOpenDotaHeroStatistics(payload: unknown): DotaHeroStatisticDto[] {
  const parsed = sourceResponseSchema.safeParse(payload);
  if (!parsed.success) throw new DotaHeroStatisticsError('DOTA_HERO_STATS_SHAPE', null, describeShape(parsed.error));
  const ids = new Set<number>();
  const heroes = parsed.data.map((row) => {
    if (ids.has(row.id)) {
      throw new DotaHeroStatisticsError('DOTA_HERO_STATS_SHAPE', null, `Duplicate hero id ${row.id}`);
    }
    if (hasWinsAbovePicks(row)) {
      throw new DotaHeroStatisticsError('DOTA_HERO_STATS_SHAPE', null, `Hero ${row.id}: wins exceed picks`);
    }
    ids.add(row.id);
    return {
      heroId: row.id,
      name: row.localized_name,
      ranked: {
        '1': rankedSample(row, '1'),
        '2': rankedSample(row, '2'),
        '3': rankedSample(row, '3'),
        '4': rankedSample(row, '4'),
        '5': rankedSample(row, '5'),
        '6': rankedSample(row, '6'),
        '7': rankedSample(row, '7'),
        '8': rankedSample(row, '8')
      },
      professional: { picks: count(row.pro_pick), wins: count(row.pro_win), bans: count(row.pro_ban) }
    };
  });
  return heroes;
}

export interface DotaHeroStatisticsRepository {
  claimPoll(input: { claimToken: string; now: number; leaseUntil: number; intervalMs: number }): Promise<boolean>;
  storeSnapshot(input: {
    claimToken: string;
    observedAt: number;
    retentionCutoff: number;
    heroesJson: string;
  }): Promise<boolean>;
  recordFailure(input: {
    claimToken: string;
    kind: string;
    code: DotaHeroStatisticsErrorCode | null;
    httpStatus: number | null;
    detail: string;
    at: number;
  }): Promise<void>;
  purgeExpiredSnapshots(input: { cutoff: number; limit: number }): Promise<number>;
  read(): Promise<{
    state: HeroStatisticsStateRow | null;
    snapshots: HeroStatisticsSnapshotRow[];
  }>;
}

interface HeroStatisticsStateRow {
  last_attempt_at: number | null;
  last_success_at: number | null;
  last_error_code: string | null;
  last_error_kind: string | null;
  last_error_http_status: number | null;
  last_error_detail: string | null;
  last_error_at: number | null;
  consecutive_failures: number;
}

interface HeroStatisticsSnapshotRow {
  observed_at: number;
  heroes_json: string;
}

export function createD1DotaHeroStatisticsRepository(db: D1Database): DotaHeroStatisticsRepository {
  return {
    async claimPoll({ claimToken, now, leaseUntil, intervalMs }) {
      const results = await db.batch([
        db.prepare('INSERT OR IGNORE INTO dota_hero_stats_state (id) VALUES (1)'),
        db
          .prepare(
            `UPDATE dota_hero_stats_state
             SET claim_token = ?1, claim_until = ?2, last_attempt_at = ?3, last_error_code = NULL, last_error_kind = NULL
             WHERE id = 1 AND (claim_until IS NULL OR claim_until <= ?3)
               AND (last_attempt_at IS NULL OR last_attempt_at <= ?3 - ?4)`
          )
          .bind(claimToken, leaseUntil, now, intervalMs)
      ]);
      return results[1]?.meta.changes === 1;
    },

    async storeSnapshot({ claimToken, observedAt, retentionCutoff, heroesJson }) {
      const results = await db.batch([
        db
          .prepare(
            `INSERT INTO dota_hero_stats_snapshots (observed_at, heroes_json)
             SELECT ?1, ?2 WHERE EXISTS (
               SELECT 1 FROM dota_hero_stats_state WHERE id = 1 AND claim_token = ?3 AND claim_until > ?1
             )`
          )
          .bind(observedAt, heroesJson, claimToken),
        db
          .prepare(
            `UPDATE dota_hero_stats_state
             SET last_success_at = ?1, last_error_code = NULL, last_error_kind = NULL, last_error_http_status = NULL,
                 last_error_detail = NULL, last_error_at = NULL, consecutive_failures = 0, claim_token = NULL, claim_until = NULL
             WHERE id = 1 AND claim_token = ?2 AND claim_until > ?1`
          )
          .bind(observedAt, claimToken),
        db
          .prepare(
            `DELETE FROM dota_hero_stats_snapshots WHERE observed_at IN (
               SELECT observed_at FROM dota_hero_stats_snapshots
               WHERE observed_at < ?1 ORDER BY observed_at LIMIT 100
             )`
          )
          .bind(retentionCutoff)
      ]);
      return results[0]?.meta.changes === 1 && results[1]?.meta.changes === 1;
    },

    async recordFailure({ claimToken, kind, code, httpStatus, detail, at }) {
      await db
        .prepare(
          `UPDATE dota_hero_stats_state SET last_error_code = ?1, last_error_kind = ?2, last_error_http_status = ?3,
             last_error_detail = ?4, last_error_at = ?5, consecutive_failures = consecutive_failures + 1,
             claim_token = NULL, claim_until = NULL
           WHERE id = 1 AND claim_token = ?6`
        )
        .bind(code, kind, httpStatus, detail, at, claimToken)
        .run();
    },

    async purgeExpiredSnapshots({ cutoff, limit }) {
      const result = await db
        .prepare(
          `DELETE FROM dota_hero_stats_snapshots WHERE observed_at IN (
             SELECT observed_at FROM dota_hero_stats_snapshots
             WHERE observed_at < ?1 ORDER BY observed_at LIMIT ?2
           )`
        )
        .bind(cutoff, limit)
        .run();
      return result.meta.changes;
    },

    async read() {
      const [state, snapshots] = await Promise.all([
        db
          .prepare(
            `SELECT last_attempt_at, last_success_at, last_error_code, last_error_kind, last_error_http_status,
                  last_error_detail, last_error_at, consecutive_failures FROM dota_hero_stats_state WHERE id = 1`
          )
          .first<HeroStatisticsStateRow>(),
        db
          .prepare('SELECT observed_at, heroes_json FROM dota_hero_stats_snapshots ORDER BY observed_at DESC LIMIT 2')
          .all<HeroStatisticsSnapshotRow>()
      ]);
      return { state, snapshots: snapshots.results };
    }
  };
}

export interface DotaHeroStatisticsService {
  get(now: number): Promise<DotaHeroStatisticsDto>;
  purgeExpiredSnapshots(now: number, limit: number): Promise<number>;
  poll(input: { now: number; newId: () => string }): Promise<{ status: 'not_due' | 'stored'; heroCount?: number }>;
}

function iso(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function parseStoredSnapshot(row: HeroStatisticsSnapshotRow) {
  let payload: unknown;
  try {
    payload = JSON.parse(row.heroes_json);
  } catch {
    throw new AppError('UNAVAILABLE', 'Stored hero statistics are invalid');
  }
  const parsed = dotaHeroStatisticsSnapshotSchema.shape.heroes.safeParse(payload);
  if (!parsed.success) throw new AppError('UNAVAILABLE', 'Stored hero statistics are invalid');
  return dotaHeroStatisticsSnapshotSchema.parse({ observedAt: iso(row.observed_at), heroes: parsed.data });
}

function toStatisticsDto(
  state: HeroStatisticsStateRow | null,
  rows: HeroStatisticsSnapshotRow[],
  now: number
): DotaHeroStatisticsDto {
  const lastAttemptAt = state?.last_attempt_at ?? null;
  const lastSuccessAt = state?.last_success_at ?? null;
  const lastError =
    state?.last_error_code === null || state?.last_error_code === undefined
      ? null
      : dotaHeroStatisticsErrorSchema.safeParse(state.last_error_code);
  if (state?.last_error_code && (!lastError || !lastError.success)) {
    throw new AppError('UNAVAILABLE', 'Stored hero statistics status is invalid');
  }
  const errorKind = state?.last_error_kind ?? state?.last_error_code ?? null;
  const health =
    errorKind !== null
      ? 'degraded'
      : lastSuccessAt === null
        ? 'unverified'
        : now - lastSuccessAt > 24 * 60 * 60 * 1000
          ? 'stale'
          : 'healthy';
  return dotaHeroStatisticsSchema.parse({
    source: { name: 'OpenDota · статистика героев (сообщество)', url: OPENDOTA_HERO_STATS_URL },
    health: dotaHeroStatisticsHealthSchema.parse(health),
    lastAttemptAt: iso(lastAttemptAt),
    lastSuccessAt: iso(lastSuccessAt),
    lastErrorCode: lastError?.success ? lastError.data : null,
    // A failure recorded before migration 0039 has a code but no time or detail: it is still shown, dated by the
    // attempt that produced it, so «Состояние лент» never says "error" without a reason.
    lastError:
      errorKind !== null && state !== null && (state.last_error_at ?? state.last_attempt_at) !== null
        ? {
            code: errorKind,
            httpStatus: state.last_error_http_status,
            detail: state.last_error_detail ?? '',
            at: iso(state.last_error_at ?? state.last_attempt_at),
            consecutiveFailures: Math.max(1, state.consecutive_failures),
            lastSuccessAt: iso(lastSuccessAt)
          }
        : null,
    latest: rows[0] ? parseStoredSnapshot(rows[0]) : null,
    previous: rows[1] ? parseStoredSnapshot(rows[1]) : null
  });
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new DotaHeroStatisticsError(
      'DOTA_HERO_STATS_BODY_LIMIT',
      null,
      `Response is ${contentLength} bytes, the limit is ${MAX_RESPONSE_BYTES}`
    );
  }
  if (response.body === null) throw new DotaHeroStatisticsError('DOTA_HERO_STATS_JSON', null, 'Empty response body');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new DotaHeroStatisticsError(
          'DOTA_HERO_STATS_BODY_LIMIT',
          null,
          `Response is larger than the ${MAX_RESPONSE_BYTES} byte limit (read ${length} bytes)`
        );
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new DotaHeroStatisticsError('DOTA_HERO_STATS_JSON', null, describeError(error));
  }
}

export function createDotaHeroStatisticsService(input: {
  repo: DotaHeroStatisticsRepository;
  fetch: () => Promise<Response>;
}): DotaHeroStatisticsService {
  return {
    async get(now) {
      const { state, snapshots } = await input.repo.read();
      return toStatisticsDto(state, snapshots, now);
    },

    async purgeExpiredSnapshots(now, limit) {
      return input.repo.purgeExpiredSnapshots({ cutoff: now - SNAPSHOT_RETENTION_MS, limit });
    },

    async poll({ now, newId }) {
      const claimToken = newId();
      const claimed = await input.repo.claimPoll({
        claimToken,
        now,
        leaseUntil: now + CLAIM_LEASE_MS,
        intervalMs: POLL_INTERVAL_MS
      });
      if (!claimed) return { status: 'not_due' };
      let stage: 'fetch' | 'store' = 'fetch';
      try {
        let response: Response;
        try {
          response = await input.fetch();
        } catch (error) {
          throw new DotaHeroStatisticsError('DOTA_HERO_STATS_FETCH', null, describeError(error));
        }
        // Redirects are not followed (`redirect: 'manual'`): a 3xx is a non-ok response here.
        if (!response.ok) {
          await response.body?.cancel();
          throw new DotaHeroStatisticsError('DOTA_HERO_STATS_HTTP', response.status, describeHttp(response));
        }
        const heroes = parseOpenDotaHeroStatistics(await readBoundedJson(response));
        stage = 'store';
        const saved = await input.repo.storeSnapshot({
          claimToken,
          observedAt: now,
          retentionCutoff: now - SNAPSHOT_RETENTION_MS,
          heroesJson: JSON.stringify(heroes)
        });
        if (!saved) throw new AppError('CONFLICT', 'Hero statistics poll claim expired');
        return { status: 'stored', heroCount: heroes.length };
      } catch (error) {
        if (error instanceof AppError) throw error;
        if (error instanceof DotaHeroStatisticsError) {
          await input.repo.recordFailure({
            claimToken,
            kind: error.code,
            code: error.code,
            httpStatus: error.httpStatus,
            detail: error.detail,
            at: now
          });
          throw error;
        }
        // Not the provider's fault (D1 write, mapper bug): never reported as a fetch failure.
        const detail = clipDetail(`${stage}: ${describeError(error)}`);
        await input.repo.recordFailure({
          claimToken,
          kind: STORE_ERROR_KIND,
          code: null,
          httpStatus: null,
          detail,
          at: now
        });
        throw error;
      }
    }
  };
}
