import {
  eligibleObservationPublicationSchema,
  manualObservationSchema,
  mediaKindSchema,
  publicationAnalyticsGroupSchema,
  publicationAnalyticsReportSchema,
  publicationAnalyticsRowSchema,
  type PublicationAnalyticsQuery,
  type PublicationAnalyticsReportDto,
  type ManualObservationDto
} from '@alexeev/contracts';
import { z } from 'zod';
import { completeIdempotencyStatement, ownsClaimSql } from '../../../platform/idempotency/d1-idempotency-store';
import { AppError } from '../../../shared/app-error';
import type { EligibleObservationPublicationsQuery, ManualObservationQuery } from '@alexeev/contracts';
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

interface EligiblePublicationRow {
  publication_id: string;
  post_title: string;
  destination_title: string;
  scheduled_at: number;
}

interface ManualObservationRow {
  id: string;
  publication_id: string;
  post_title: string;
  destination_title: string;
  metric: 'views' | 'forwards' | 'reactions';
  value: number;
  content_age_minutes: number;
  source_label: string;
  coverage: 'complete' | 'partial';
  coverage_note: string | null;
  observed_at: number;
}

function encodePickerCursor(scheduledAt: number, publicationId: string): string {
  return btoa(`${scheduledAt}|${publicationId}`);
}

function decodePickerCursor(value: string | undefined): { scheduledAt: number; publicationId: string } | null {
  if (value === undefined) return null;
  try {
    const [scheduledAtRaw, publicationId] = atob(value).split('|');
    const scheduledAt = Number(scheduledAtRaw);
    if (!Number.isSafeInteger(scheduledAt) || scheduledAt < 0 || !z.uuid().safeParse(publicationId).success)
      throw new Error('invalid cursor');
    return { scheduledAt, publicationId: publicationId as string };
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Invalid publication picker cursor');
  }
}

function encodeObservationCursor(observedAt: number, id: string): string {
  return btoa(`${observedAt}|${id}`);
}

function decodeObservationCursor(value: string | undefined): { observedAt: number; id: string } | null {
  if (value === undefined) return null;
  try {
    const [observedAtRaw, id] = atob(value).split('|');
    const observedAt = Number(observedAtRaw);
    if (!Number.isSafeInteger(observedAt) || observedAt < 0 || !z.uuid().safeParse(id).success)
      throw new Error('invalid cursor');
    return { observedAt, id: id as string };
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Invalid observation cursor');
  }
}

function observationDto(row: ManualObservationRow): ManualObservationDto {
  return manualObservationSchema.parse({
    id: row.id,
    publicationId: row.publication_id,
    postTitle: row.post_title,
    destinationTitle: row.destination_title,
    metric: row.metric,
    value: row.value,
    contentAgeMinutes: row.content_age_minutes,
    sourceLabel: row.source_label,
    coverage: row.coverage,
    coverageNote: row.coverage_note,
    observedAt: new Date(row.observed_at).toISOString()
  });
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
    },

    async listEligiblePublications(query: EligibleObservationPublicationsQuery) {
      const cursor = decodePickerCursor(query.cursor);
      const bindings: (string | number)[] = [];
      const clauses = ["j.status = 'succeeded'"];
      if (query.q !== undefined) {
        bindings.push(query.q);
        clauses.push(`instr(pr.title || ' ' || d.title, ?${bindings.length}) > 0`);
      }
      if (cursor !== null) {
        bindings.push(cursor.scheduledAt, cursor.publicationId);
        clauses.push(
          `(p.scheduled_at < ?${bindings.length - 1} OR (p.scheduled_at = ?${bindings.length - 1} AND p.id < ?${bindings.length}))`
        );
      }
      bindings.push(query.limit + 1);
      const result = await db
        .prepare(
          `SELECT p.id AS publication_id, pr.title AS post_title, d.title AS destination_title, p.scheduled_at
           FROM jobs j
           JOIN publications p ON p.id = j.publication_id
           JOIN post_revisions pr ON pr.post_id = p.post_id AND pr.revision = p.post_revision
           JOIN destinations d ON d.id = p.destination_id
           WHERE ${clauses.join(' AND ')}
           ORDER BY p.scheduled_at DESC, p.id DESC LIMIT ?${bindings.length}`
        )
        .bind(...bindings)
        .all<EligiblePublicationRow>();
      const rows = result.results.slice(0, query.limit);
      const last = rows.at(-1);
      return {
        items: rows.map((row) =>
          eligibleObservationPublicationSchema.parse({
            publicationId: row.publication_id,
            postTitle: row.post_title,
            destinationTitle: row.destination_title
          })
        ),
        nextCursor:
          result.results.length > query.limit && last !== undefined
            ? encodePickerCursor(last.scheduled_at, last.publication_id)
            : null
      };
    },

    async listObservations(query: ManualObservationQuery) {
      const cursor = decodeObservationCursor(query.cursor);
      const bindings: (string | number)[] = [];
      const clauses: string[] = [];
      const add = (sql: string, value: string | number) => {
        bindings.push(value);
        clauses.push(sql.replace('?', `?${bindings.length}`));
      };
      if (query.publicationId !== undefined) add('publication_id = ?', query.publicationId);
      if (query.metric !== undefined) add('metric = ?', query.metric);
      if (query.contentAgeMinutes !== undefined) add('content_age_minutes = ?', query.contentAgeMinutes);
      if (cursor !== null) {
        bindings.push(cursor.observedAt, cursor.id);
        clauses.push(
          `(observed_at < ?${bindings.length - 1} OR (observed_at = ?${bindings.length - 1} AND id < ?${bindings.length}))`
        );
      }
      bindings.push(query.limit + 1);
      const result = await db
        .prepare(
          `SELECT id, publication_id, post_title, destination_title, metric, value, content_age_minutes,
                  source_label, coverage, coverage_note, observed_at
           FROM manual_analytics_observations
           ${clauses.length === 0 ? '' : `WHERE ${clauses.join(' AND ')}`}
           ORDER BY observed_at DESC, id DESC LIMIT ?${bindings.length}`
        )
        .bind(...bindings)
        .all<ManualObservationRow>();
      const rows = result.results.slice(0, query.limit);
      const last = rows.at(-1);
      return {
        items: rows.map(observationDto),
        nextCursor:
          result.results.length > query.limit && last !== undefined
            ? encodeObservationCursor(last.observed_at, last.id)
            : null
      };
    },

    async createObservation({ id, actor, now, observation, idempotency }) {
      const publication = await db
        .prepare(
          `SELECT pr.title AS post_title, d.title AS destination_title
           FROM jobs j
           JOIN publications p ON p.id = j.publication_id
           JOIN post_revisions pr ON pr.post_id = p.post_id AND pr.revision = p.post_revision
           JOIN destinations d ON d.id = p.destination_id
           WHERE p.id = ?1 AND j.status = 'succeeded' LIMIT 1`
        )
        .bind(observation.publicationId)
        .first<{ post_title: string; destination_title: string }>();
      if (publication === null) throw new AppError('NOT_FOUND', 'Sent publication not found');
      const dto = manualObservationSchema.parse({
        id,
        publicationId: observation.publicationId,
        postTitle: publication.post_title,
        destinationTitle: publication.destination_title,
        metric: observation.metric,
        value: observation.value,
        contentAgeMinutes: observation.contentAgeMinutes,
        sourceLabel: observation.sourceLabel,
        coverage: observation.coverage,
        coverageNote: observation.coverageNote ?? null,
        observedAt: new Date(now).toISOString()
      });
      const [inserted, audited, completed] = await db.batch([
        db
          .prepare(
            `INSERT INTO manual_analytics_observations (
               id, publication_id, post_title, destination_title, metric, value, content_age_minutes,
               source_label, coverage, coverage_note, actor_telegram_id, observed_at
             )
             SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12
             WHERE EXISTS (
               SELECT 1 FROM jobs j JOIN publications p ON p.id = j.publication_id
               WHERE p.id = ?2 AND j.status = 'succeeded'
             ) AND ${ownsClaimSql(13)}`
          )
          .bind(
            id,
            observation.publicationId,
            publication.post_title,
            publication.destination_title,
            observation.metric,
            observation.value,
            observation.contentAgeMinutes,
            observation.sourceLabel,
            observation.coverage,
            observation.coverageNote ?? null,
            actor,
            now,
            idempotency.scope,
            idempotency.key,
            idempotency.requestHash,
            idempotency.claimedAt
          ),
        db
          .prepare(
            `INSERT INTO audit_log (actor_telegram_id, action, entity_type, entity_id, created_at, details)
             SELECT ?1, 'analytics.observation.create', 'analytics_observation', ?2, ?3,
                    json_object('metric', ?4, 'contentAgeMinutes', ?5)
             WHERE EXISTS (SELECT 1 FROM manual_analytics_observations WHERE id = ?2)`
          )
          .bind(actor, id, now, observation.metric, observation.contentAgeMinutes),
        completeIdempotencyStatement(db, idempotency, { status: 201, body: JSON.stringify(dto) }, now, {
          sql: 'EXISTS (SELECT 1 FROM manual_analytics_observations WHERE id = ?8)',
          bindings: [id]
        })
      ]);
      if (inserted?.meta.changes !== 1 || audited?.meta.changes !== 1 || completed?.meta.changes !== 1) return null;
      return dto;
    }
  };
}
