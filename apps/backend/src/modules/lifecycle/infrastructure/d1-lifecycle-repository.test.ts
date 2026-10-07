import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '../../../../tests/helpers/db';
import { createApi, fakeClock, OWNER_TOKEN, resetDb, seedSession, START } from '../../../../tests/helpers/harness';
import { addScheduled, DAY, postRow, runTick, seedSentPost, setJob } from '../../../../tests/helpers/lifecycle';
import { count, seedApprovedPost } from '../../../../tests/helpers/publishing';
import { JOB_STATES_FOR_TESTS } from '../../../../tests/helpers/job-states';
import { seedDueJob } from '../../../../tests/helpers/dispatch';
import {
  createD1LifecycleRepository,
  DELETE_STATEMENTS,
  FIND_ARCHIVABLE,
  FIND_EXPIRED
} from './d1-lifecycle-repository';

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 400 * DAY });
});

const MINUTE = 60_000;

async function plan(sql: string, ...bindings: (number | string | null)[]): Promise<string> {
  const { results } = await testDb()
    .prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .bind(...bindings)
    .all<{ detail: string }>();
  return results.map((row) => row.detail).join('\n');
}

// Undoes the tick's archiving: the tests below call the repository on their own.
async function sentPost() {
  const api = createApi({ clock: fakeClock() });
  const clock = fakeClock();
  const seeded = await seedSentPost(api, clock);
  await testDb().prepare('UPDATE posts SET archived_at = NULL WHERE id = ?1').bind(seeded.postId).run();
  await testDb().prepare("DELETE FROM audit_log WHERE action = 'post.archive'").run();
  return { api, seeded };
}

async function archived() {
  const api = createApi({ clock: fakeClock() });
  const clock = fakeClock();
  const seeded = await seedSentPost(api, clock);
  expect((await postRow(seeded.postId))?.archived_at).toBe(START);
  return seeded;
}

describe('query plans', () => {
  it('the archive scan starts from recently finished jobs through their partial index, without sorting history', async () => {
    const text = await plan(FIND_ARCHIVABLE, START, 25);

    expect(text).toMatch(/SEARCH j USING INDEX jobs_final_updated_idx \(updated_at>\?\)/);
    expect(text).not.toMatch(/SCAN j\b/);
  });

  it('the purge scan walks the archive index from the oldest archived post', async () => {
    const text = await plan(FIND_EXPIRED, START, 50);

    expect(text).toContain('posts_archive_idx');
    expect(text).not.toContain('TEMP B-TREE');
  });
});

describe('the archive write re-checks every condition at write time', () => {
  it('archives a qualifying post once, and not again', async () => {
    const { seeded } = await sentPost();
    const repo = createD1LifecycleRepository(testDb());

    expect(await repo.archivePosts({ ids: [seeded.postId], now: START + MINUTE })).toBe(1);
    expect(await repo.archivePosts({ ids: [seeded.postId], now: START + 2 * MINUTE })).toBe(0);

    expect((await postRow(seeded.postId))?.archived_at).toBe(START + MINUTE);
    expect(await count('audit_log', "action = 'post.archive'")).toBe(1);
  });

  it('refuses a post with something still to send', async () => {
    const { api, seeded } = await sentPost();
    await addScheduled(api, seeded.postId, 1, START + 60 * MINUTE);

    expect(await createD1LifecycleRepository(testDb()).archivePosts({ ids: [seeded.postId], now: START })).toBe(0);
    expect(await count('audit_log', "action = 'post.archive'")).toBe(0);
  });

  it('refuses a post that only has a failed publication, and a draft or unknown id', async () => {
    const { seeded } = await sentPost();
    await setJob(seeded.publicationId, "status = 'failed'");
    const api = createApi({ clock: fakeClock() });
    const approved = await seedApprovedPost(api);

    const repo = createD1LifecycleRepository(testDb());

    expect(await repo.archivePosts({ ids: [seeded.postId, approved.id, crypto.randomUUID()], now: START })).toBe(0);
  });

  it('refuses a restored post until something is sent after the restore', async () => {
    const { seeded } = await sentPost();
    await testDb()
      .prepare('UPDATE posts SET restored_at = ?1 WHERE id = ?2')
      .bind(START + MINUTE, seeded.postId)
      .run();

    expect(
      await createD1LifecycleRepository(testDb()).archivePosts({ ids: [seeded.postId], now: START + 2 * MINUTE })
    ).toBe(0);
    expect(await postRow(seeded.postId)).toMatchObject({ archived_at: null });
  });
});

describe('the purge write re-checks every condition at write time', () => {
  it.each([
    ['unknown', "status = 'unknown', send_started_at = ?2"],
    ['being sent', "status = 'claimed', lease_until = ?2, send_started_at = ?2"]
  ])('never deletes a post with a publication that is %s, even when asked for it by id', async (_name, set) => {
    const seeded = await archived();
    await setJob(seeded.publicationId, set, START + DAY);

    const purged = await createD1LifecycleRepository(testDb()).purgePosts({
      ids: [seeded.postId],
      before: START + DAY,
      now: START + DAY
    });

    expect(purged).toBe(0);
    expect(await postRow(seeded.postId)).not.toBeNull();
    expect(await count('jobs')).toBe(1);
    expect(await count('audit_log', "action = 'post.purge'")).toBe(0);
  });

  it('does not delete a post that is not archived or whose retention has not ended', async () => {
    const seeded = await archived();
    const repo = createD1LifecycleRepository(testDb());

    expect(await repo.purgePosts({ ids: [seeded.postId], before: START - 1, now: START })).toBe(0);
    await testDb().prepare('UPDATE posts SET archived_at = NULL WHERE id = ?1').bind(seeded.postId).run();
    expect(await repo.purgePosts({ ids: [seeded.postId], before: START + DAY, now: START })).toBe(0);
    expect(await postRow(seeded.postId)).not.toBeNull();
  });

  it('deletes an expired archived post with everything under it', async () => {
    const seeded = await archived();
    await runTick(fakeClock(START + 40 * DAY));
    const repo = createD1LifecycleRepository(testDb());

    expect(await repo.purgePosts({ ids: [seeded.postId], before: START + DAY, now: START + DAY })).toBe(1);

    for (const table of ['posts', 'post_revisions', 'publications', 'jobs', 'job_attempts']) {
      expect(await count(table)).toBe(0);
    }
  });
});

describe('incidents are found by index when a post is deleted', () => {
  it('neither child lookup scans the incidents table', async () => {
    const text = await plan(DELETE_STATEMENTS[1] ?? '', '[]', null);

    expect(text).toContain('incidents_publication_idx');
    expect(text).toContain('incidents_job_idx');
    expect(text).not.toMatch(/SCAN incidents/);
  });
});

// The SQL names job states as literals. Every state the schema allows must fall in exactly one
// group, so a state added later cannot silently skip the delete or archive guard.
const BLOCKING = ['claimed', 'unknown'];
const CANCELLABLE = ['pending', 'retry_wait'];
const FINAL = ['succeeded', 'failed', 'cancelled'];

describe('every job state is handled by the delete and archive guards', () => {
  it('the schema CHECK, the publishing state list and the three groups are the same set, with no overlap', async () => {
    const row = await testDb().prepare("SELECT sql FROM sqlite_master WHERE name = 'jobs'").first<{ sql: string }>();
    const list = /status IN \(([^)]*)\)/.exec(row?.sql ?? '')?.[1] ?? '';
    const allowed = [...list.matchAll(/'([a-z_]+)'/g)].map((match) => match[1] ?? '');
    const grouped = [...BLOCKING, ...CANCELLABLE, ...FINAL];

    expect(new Set(allowed)).toEqual(new Set(JOB_STATES_FOR_TESTS));
    expect([...grouped].sort()).toEqual([...allowed].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it.each(JOB_STATES_FOR_TESTS)('delete: a publication in state %s is handled by its group', async (state) => {
    const api = createApi({ clock: fakeClock() });
    const seeded = await seedDueJob(api);
    await setJob(seeded.publicationId, 'status = ?2', state);

    const [outcome] = await createD1LifecycleRepository(testDb()).deletePosts({
      items: [{ id: seeded.postId, revision: 1 }],
      actor: '4242',
      now: START
    });

    if (BLOCKING.includes(state)) {
      expect(outcome).toMatchObject({ outcome: 'refused' });
      expect(await postRow(seeded.postId)).not.toBeNull();
    } else if (CANCELLABLE.includes(state)) {
      expect(outcome).toMatchObject({ outcome: 'deleted' });
      expect(outcome?.outcome === 'deleted' && outcome.cancelledPublications).toHaveLength(1);
    } else {
      expect(FINAL).toContain(state);
      expect(outcome).toMatchObject({ outcome: 'deleted', cancelledPublications: [] });
    }
  });

  it.each(JOB_STATES_FOR_TESTS)('archive: a sent post with a second publication in state %s', async (state) => {
    const { api, seeded } = await sentPost();
    const extra = await addScheduled(api, seeded.postId, 1, START + 60 * MINUTE);
    await setJob(extra.id, 'status = ?2', state);

    const archivedCount = await createD1LifecycleRepository(testDb()).archivePosts({
      ids: [seeded.postId],
      now: START
    });

    // Only a final second publication lets the post go to the archive.
    expect(archivedCount).toBe(FINAL.includes(state) ? 1 : 0);
  });
});
