import {
  apiErrorSchema,
  eligibleObservationPublicationsPageSchema,
  manualObservationSchema,
  manualObservationsPageSchema,
  publicationAnalyticsReportSchema
} from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../helpers/db';
import { fakeTransport, makeTick, SENT, seedDueJob } from '../helpers/dispatch';
import { type Api, createApi, fakeClock, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';
import { count } from '../helpers/publishing';

const MINUTE = 60_000;
const from = new Date(START - MINUTE).toISOString();
const to = new Date(START + 60 * MINUTE).toISOString();
const reportUrl = (query = '') =>
  `/api/v1/analytics/publications?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${query}`;

let api: Api;

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 86_400_000 });
  api = createApi({ clock: fakeClock() });
});

async function send(outcome = SENT) {
  const seeded = await seedDueJob(api);
  await makeTick({ clock: api.clock, transport: fakeTransport(outcome) }).run();
  return seeded;
}

describe('GET /api/v1/analytics/publications', () => {
  it('returns a contract-valid owner-only report from append-only snapshots and keeps it after publication deletion', async () => {
    const seeded = await send();

    const response = await api.request(reportUrl());

    expect(response.status).toBe(200);
    const report = publicationAnalyticsReportSchema.parse(await response.json());
    expect(report.summary).toMatchObject({ publications: 1, sent: 1, failed: 0, unknown: 0, attempts: 1, retries: 0 });
    expect(report.publications.items).toHaveLength(1);
    expect(report.publications.items[0]).toMatchObject({
      publicationId: seeded.publicationId,
      postId: seeded.postId,
      outcome: 'sent',
      destinationId: seeded.destinationId,
      destinationTitle: expect.any(String),
      attemptCount: 1,
      retryCount: 0
    });
    expect(await count('analytics_snapshots', `publication_id = '${seeded.publicationId}'`)).toBeGreaterThan(0);
    await makeTick({ clock: api.clock, transport: fakeTransport(SENT) }).run();
    expect(await count('analytics_snapshots', `publication_id = '${seeded.publicationId}'`)).toBe(1);

    const publication = await api.request(`/api/v1/publications/${seeded.publicationId}`);
    const publicationBody = (await publication.json()) as { revision: number };
    const deletion = await api.request(`/api/v1/publications/${seeded.publicationId}/delete`, {
      method: 'POST',
      json: { revision: publicationBody.revision }
    });
    expect(deletion.status).toBe(200);
    expect(await count('publications', `id = '${seeded.publicationId}'`)).toBe(0);
    const afterDeletion = publicationAnalyticsReportSchema.parse(await (await api.request(reportUrl())).json());
    expect(afterDeletion.publications.items[0]?.publicationId).toBe(seeded.publicationId);
  });

  it('reports the latest observation per publication while retaining unknown history', async () => {
    const seeded = await send({ kind: 'unknown', reason: 'timeout' });
    const first = publicationAnalyticsReportSchema.parse(await (await api.request(reportUrl())).json());
    expect(first.summary).toMatchObject({ sent: 0, unknown: 1 });
    expect(first.publications.items[0]?.outcome).toBe('unknown');

    api.clock.advance(MINUTE);
    const resolution = await api.request(`/api/v1/publications/${seeded.publicationId}/resolve-unknown`, {
      method: 'POST',
      json: { outcome: 'sent', revision: 0, externalMessageId: '9001' }
    });
    expect(resolution.status).toBe(200);
    const latest = publicationAnalyticsReportSchema.parse(await (await api.request(reportUrl())).json());
    expect(latest.summary).toMatchObject({ publications: 1, sent: 1, unknown: 0, attempts: 1, retries: 0 });
    expect(latest.publications.items.map((row) => row.outcome)).toEqual(['sent']);
    const beforeResolution = publicationAnalyticsReportSchema.parse(
      await (
        await api.request(
          `/api/v1/analytics/publications?from=${encodeURIComponent(from)}&to=${encodeURIComponent(new Date(START + 30_000).toISOString())}`
        )
      ).json()
    );
    expect(beforeResolution.summary).toMatchObject({ publications: 1, sent: 0, unknown: 1 });
    expect(await count('analytics_snapshots', `publication_id = '${seeded.publicationId}'`)).toBeGreaterThan(1);
  });

  it('applies outcome, destination, and media filters and uses bounded keyset pagination', async () => {
    const first = await send();
    await send({ kind: 'rejected', code: 'CONTENT_INVALID' });

    const filtered = publicationAnalyticsReportSchema.parse(
      await (
        await api.request(
          reportUrl(`&destinationId=${first.destinationId}&outcome=sent&comparison=destination&limit=1`)
        )
      ).json()
    );
    expect(filtered.publications.items).toHaveLength(1);
    expect(filtered.publications.items[0]?.publicationId).toBe(first.publicationId);
    expect(filtered.summary).toMatchObject({ publications: 1, sent: 1, failed: 0, unknown: 0 });

    const page1 = publicationAnalyticsReportSchema.parse(await (await api.request(reportUrl('&limit=1'))).json());
    expect(page1.publications.items).toHaveLength(1);
    expect(page1.publications.nextCursor).not.toBeNull();
    const page2Response = await api.request(
      reportUrl(`&limit=1&cursor=${encodeURIComponent(page1.publications.nextCursor ?? '')}`)
    );
    expect(
      page2Response.status,
      `${page1.publications.nextCursor} ${JSON.stringify(await page2Response.clone().json())}`
    ).toBe(200);
    const page2 = publicationAnalyticsReportSchema.parse(await page2Response.json());
    expect(page2.publications.items).toHaveLength(1);
    expect(page2.publications.items[0]?.publicationId).not.toBe(page1.publications.items[0]?.publicationId);

    const byMedia = await api.request(reportUrl('&mediaKind=video&comparison=media'));
    expect(byMedia.status).toBe(200);
    expect(publicationAnalyticsReportSchema.parse(await byMedia.json()).publications.items).toEqual([]);
  });

  it('counts a publication only once per media kind even when it has multiple attachments of that kind', async () => {
    const seeded = await send();
    // The analytics query reads an immutable snapshot; seed the retained value directly to
    // exercise a real multi-attachment projection without involving Telegram media validation.
    await testDb()
      .prepare('UPDATE analytics_snapshots SET media_kinds = ?2 WHERE publication_id = ?1')
      .bind(seeded.publicationId, JSON.stringify(['photo', 'photo']))
      .run();

    const report = publicationAnalyticsReportSchema.parse(
      await (await api.request(reportUrl('&comparison=media'))).json()
    );
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0]).toMatchObject({
      key: 'photo',
      counts: { publications: 1, sent: 1, attempts: 1, retries: 0 },
      coveredPublications: 1,
      unrecordedPublications: 0
    });
  });

  it('rejects anonymous, malformed, and out-of-range reads without exposing report data', async () => {
    expect((await api.request(reportUrl(), { token: null })).status).toBe(401);
    await seedSession({ token: 'foreign-owner-token-000000000000000', telegramId: '9999' });
    const forbidden = await api.request(reportUrl(), { token: 'foreign-owner-token-000000000000000' });
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect((await api.request('/api/v1/analytics/publications?from=bad&to=bad')).status).toBe(400);
    expect((await api.request(reportUrl('&cursor=not-a-cursor'))).status).toBe(400);
    const tooWide = await api.request(
      `/api/v1/analytics/publications?from=${encodeURIComponent(from)}&to=${encodeURIComponent(new Date(START + 367 * 86_400_000).toISOString())}`
    );
    expect(tooWide.status).toBe(400);
    expect(publicationAnalyticsReportSchema.safeParse(await tooWide.json()).success).toBe(false);
  });

  it('uses the reporting index for bounded observation-time scans', async () => {
    const plans = await testDb()
      .prepare(
        `EXPLAIN QUERY PLAN SELECT snapshot_id FROM analytics_snapshots
         WHERE observed_at >= ?1 AND observed_at < ?2 ORDER BY observed_at DESC, snapshot_id DESC LIMIT ?3`
      )
      .bind(START, START + 1, 20)
      .all<{ detail: string }>();
    expect(plans.results.some((row) => row.detail.includes('analytics_snapshots_observed_idx'))).toBe(true);
  });
});

describe('manual analytics observations', () => {
  it('lists only sent publications and creates an owner-entered observation with exact idempotent replay', async () => {
    const sent = await send();
    await send({ kind: 'rejected', code: 'CONTENT_INVALID' });
    const pickerResponse = await api.request('/api/v1/analytics/eligible-publications?limit=1');
    expect(pickerResponse.status).toBe(200);
    const picker = eligibleObservationPublicationsPageSchema.parse(await pickerResponse.json());
    expect(picker.items).toHaveLength(1);
    expect(picker.items[0]?.publicationId).toBe(sent.publicationId);

    const payload = {
      publicationId: sent.publicationId,
      metric: 'views',
      value: 0,
      contentAgeMinutes: 1440,
      sourceLabel: 'Telegram Statistics',
      coverage: 'complete'
    };
    const first = await api.request('/api/v1/analytics/observations', {
      method: 'POST',
      headers: { 'idempotency-key': 'manual-observation-1' },
      json: payload
    });
    expect(first.status).toBe(201);
    const observation = manualObservationSchema.parse(await first.json());
    expect(observation).toMatchObject({
      publicationId: sent.publicationId,
      metric: 'views',
      value: 0,
      contentAgeMinutes: 1440,
      coverage: 'complete',
      sourceLabel: 'Telegram Statistics'
    });
    expect(observation.postTitle).toEqual(picker.items[0]?.postTitle);

    const replay = await api.request('/api/v1/analytics/observations', {
      method: 'POST',
      headers: { 'idempotency-key': 'manual-observation-1' },
      json: payload
    });
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(observation);
    expect(await count('manual_analytics_observations')).toBe(1);
    expect(await count('audit_log', "action = 'analytics.observation.create'")).toBe(1);

    const reused = await api.request('/api/v1/analytics/observations', {
      method: 'POST',
      headers: { 'idempotency-key': 'manual-observation-1' },
      json: { ...payload, value: 1 }
    });
    expect(reused.status).toBe(409);
    expect(await count('manual_analytics_observations')).toBe(1);
  });

  it('requires an explanation for partial data and refuses a publication that was not sent', async () => {
    const pending = await seedDueJob(api);
    const payload = {
      publicationId: pending.publicationId,
      metric: 'forwards',
      value: 12,
      contentAgeMinutes: 60,
      sourceLabel: 'Telegram Statistics',
      coverage: 'partial'
    };
    const partial = await api.request('/api/v1/analytics/observations', {
      method: 'POST',
      headers: { 'idempotency-key': 'partial-without-note' },
      json: payload
    });
    expect(partial.status).toBe(400);
    expect(apiErrorSchema.parse(await partial.json()).error.code).toBe('VALIDATION_ERROR');

    const notSent = await api.request('/api/v1/analytics/observations', {
      method: 'POST',
      headers: { 'idempotency-key': 'not-sent' },
      json: { ...payload, coverageNote: 'Some post values were unavailable' }
    });
    expect(notSent.status).toBe(404);
    expect(await count('manual_analytics_observations')).toBe(0);
  });

  it('uses the D1 idempotency claim as the concurrent duplicate boundary', async () => {
    const sent = await send();
    const payload = {
      publicationId: sent.publicationId,
      metric: 'views',
      value: 37,
      contentAgeMinutes: 360,
      sourceLabel: 'Telegram Statistics',
      coverage: 'complete'
    };
    const sendRequest = () =>
      api.request('/api/v1/analytics/observations', {
        method: 'POST',
        headers: { 'idempotency-key': 'observation-concurrent' },
        json: payload
      });
    const [first, second] = await Promise.all([sendRequest(), sendRequest()]);
    expect([first.status, second.status].some((status) => status === 201)).toBe(true);
    expect([first.status, second.status].every((status) => status === 201 || status === 409)).toBe(true);
    expect(await count('manual_analytics_observations')).toBe(1);
    const replay = await sendRequest();
    expect(replay.status).toBe(201);
    expect(await count('manual_analytics_observations')).toBe(1);
  });

  it('returns owner-only, bounded observation history with metric/age filters and indexed scans', async () => {
    const sent = await send();
    const payload = {
      publicationId: sent.publicationId,
      metric: 'reactions',
      value: 8,
      contentAgeMinutes: 4320,
      sourceLabel: 'Telegram Statistics',
      coverage: 'partial',
      coverageNote: 'Some reaction types were unavailable'
    };
    expect((await api.request('/api/v1/analytics/observations', { token: null })).status).toBe(401);
    const create = await api.request('/api/v1/analytics/observations', {
      method: 'POST',
      headers: { 'idempotency-key': 'partial-observation' },
      json: payload
    });
    expect(create.status).toBe(201);
    const page = manualObservationsPageSchema.parse(
      await (await api.request('/api/v1/analytics/observations?metric=reactions&contentAgeMinutes=4320')).json()
    );
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ coverage: 'partial', coverageNote: payload.coverageNote, value: 8 });
    expect(
      manualObservationsPageSchema.parse(
        await (await api.request('/api/v1/analytics/observations?metric=views&contentAgeMinutes=4320')).json()
      ).items
    ).toEqual([]);
    const plan = await testDb()
      .prepare(
        `EXPLAIN QUERY PLAN SELECT id FROM manual_analytics_observations
         WHERE metric = ?1 AND content_age_minutes = ?2 ORDER BY observed_at DESC, id DESC LIMIT ?3`
      )
      .bind('reactions', 4320, 20)
      .all<{ detail: string }>();
    expect(plan.results.some((row) => row.detail.includes('manual_analytics_observations_metric_age_idx'))).toBe(true);
  });

  it('paginates eligible publications and observation history without crossing cursors', async () => {
    const firstSent = await send();
    api.clock.advance(MINUTE);
    const secondSent = await send();
    const picker1 = eligibleObservationPublicationsPageSchema.parse(
      await (await api.request('/api/v1/analytics/eligible-publications?limit=1')).json()
    );
    expect(picker1.items).toHaveLength(1);
    expect(picker1.nextCursor).not.toBeNull();
    const picker2 = eligibleObservationPublicationsPageSchema.parse(
      await (
        await api.request(
          `/api/v1/analytics/eligible-publications?limit=1&cursor=${encodeURIComponent(picker1.nextCursor ?? '')}`
        )
      ).json()
    );
    expect(picker2.items).toHaveLength(1);
    expect(picker2.items[0]?.publicationId).not.toBe(picker1.items[0]?.publicationId);
    expect([firstSent.publicationId, secondSent.publicationId]).toContain(picker1.items[0]?.publicationId);

    for (const publicationId of [firstSent.publicationId, secondSent.publicationId]) {
      const response = await api.request('/api/v1/analytics/observations', {
        method: 'POST',
        headers: { 'idempotency-key': `history-${publicationId}` },
        json: {
          publicationId,
          metric: 'views',
          value: 22,
          contentAgeMinutes: 60,
          sourceLabel: 'Telegram Statistics',
          coverage: 'complete'
        }
      });
      expect(response.status).toBe(201);
      api.clock.advance(MINUTE);
    }
    const history1 = manualObservationsPageSchema.parse(
      await (await api.request('/api/v1/analytics/observations?metric=views&contentAgeMinutes=60&limit=1')).json()
    );
    expect(history1.items).toHaveLength(1);
    expect(history1.nextCursor).not.toBeNull();
    const history2 = manualObservationsPageSchema.parse(
      await (
        await api.request(
          `/api/v1/analytics/observations?metric=views&contentAgeMinutes=60&limit=1&cursor=${encodeURIComponent(history1.nextCursor ?? '')}`
        )
      ).json()
    );
    expect(history2.items).toHaveLength(1);
    expect(history2.items[0]?.id).not.toBe(history1.items[0]?.id);

    const pickerPlan = await testDb()
      .prepare(
        `EXPLAIN QUERY PLAN SELECT p.id FROM jobs j JOIN publications p ON p.id = j.publication_id
         WHERE j.status = 'succeeded' ORDER BY p.scheduled_at DESC, p.id DESC LIMIT ?1`
      )
      .bind(20)
      .all<{ detail: string }>();
    expect(pickerPlan.results.some((row) => row.detail.includes('jobs_status_scheduled_idx'))).toBe(true);
  });
});
