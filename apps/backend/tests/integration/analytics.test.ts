import { publicationAnalyticsReportSchema } from '@alexeev/contracts';
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
