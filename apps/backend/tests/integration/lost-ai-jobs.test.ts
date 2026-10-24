import { beforeEach, describe, expect, it } from 'vitest';
import { LOST_AFTER_MS, reportLostAiJobs } from '../../src/app/workflows/lost-ai-jobs';
import { createD1WriterRepository } from '../../src/modules/ai';
import { createD1ContentAlertRepository } from '../../src/modules/content-analytics';
import { testDb } from '../helpers/db';
import { resetDb, START } from '../helpers/harness';

// A writer job whose Worker died after its claim (review 19.10.2026): the model is never called twice, so the
// owner is told once that the draft did not come, and a job that ended is never reported.

const LOST = '00000000-0000-4000-8000-000000000001';
const DONE = '00000000-0000-4000-8000-000000000002';
const FRESH = '00000000-0000-4000-8000-000000000003';
const REVIEW = '00000000-0000-4000-8000-000000000004';

const deps = (now: number) => ({
  writer: createD1WriterRepository(testDb()),
  alerts: createD1ContentAlertRepository(testDb()),
  now
});

beforeEach(resetDb);

describe('lost AI jobs', () => {
  it('reports a chat job that never finished once, and nothing that ended, is fresh or has no chat', async () => {
    const writer = createD1WriterRepository(testDb());
    expect(await writer.claimJob(LOST, START, { chatId: 42, messageId: 7 })).toBe(true);
    expect(await writer.claimJob(DONE, START, { chatId: 42, messageId: 8 })).toBe(true);
    await writer.finishJob(DONE, START + 60_000);
    // A report review has no chat message to wait on.
    expect(await writer.claimJob(REVIEW, START)).toBe(true);
    const later = START + LOST_AFTER_MS + 60_000;
    expect(await writer.claimJob(FRESH, later - 60_000, { chatId: 42, messageId: 9 })).toBe(true);
    // A redelivered copy of the lost job is still refused: the model is not called again.
    expect(await writer.claimJob(LOST, later, { chatId: 42, messageId: 7 })).toBe(false);

    expect(await reportLostAiJobs(deps(later))).toBe(1);
    expect(await reportLostAiJobs(deps(later + 60_000))).toBe(0);
    const alerts = await testDb()
      .prepare(`SELECT id, html FROM content_alerts WHERE id LIKE 'ai-lost:%'`)
      .all<{ id: string; html: string }>();
    expect(alerts.results).toEqual([
      { id: `ai-lost:${LOST}`, html: expect.stringContaining('Черновик не дописался') as string }
    ]);
  });

  it('tells a lost publishing job as a post that never reached the channel, with a link to it (review 24.10.2026)', async () => {
    const writer = createD1WriterRepository(testDb());
    const postId = '00000000-0000-4000-8000-0000000000aa';
    expect(await writer.claimJob(LOST, START, { chatId: 42, messageId: null, kind: 'patch_publish', postId })).toBe(
      true
    );
    expect(await reportLostAiJobs(deps(START + LOST_AFTER_MS + 60_000))).toBe(1);
    const alert = await testDb()
      .prepare(`SELECT html, link_path FROM content_alerts WHERE id = ?1`)
      .bind(`ai-lost:${LOST}`)
      .first<{ html: string; link_path: string }>();
    expect(alert).toEqual({
      html: expect.stringContaining('Пост не ушёл в канал') as string,
      link_path: `/posts/${postId}`
    });
  });
});
