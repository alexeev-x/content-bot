import { describe, expect, it } from 'vitest';
import { channelPosts } from './channel-posts';
import { AUTOPUBLISH_ACTOR } from '../workflows/autopublish-source-event';
import { RUBRIC_ACTOR } from '../workflows/rubric-actor';

// What the scheduler counts in the rubric channel: the news, never the owner's posts (gap only), never other channels,
// a series once.

const NOW = 1_800_000_000_000;
const DEST = { id: 'dest-main', chatId: '-100' };
const base = {
  job: { status: 'succeeded' as const, runAt: NOW - 1000, sendStartedAt: NOW - 900 },
  jobUpdatedAt: NOW - 800,
  externalMessageIds: ['1'],
  externalPollId: null,
  lastErrorCode: null,
  postKind: 'text' as 'text' | 'poll',
  hasMedia: false,
  destinationId: DEST.id,
  actor: '111',
  seriesPosition: null as number | null
};
let counter = 0;
const row = (extra: Partial<typeof base> & { scheduledAt?: number } = {}) => {
  counter += 1;
  return {
    ...base,
    publicationId: `p${counter}`,
    postId: `post${counter}`,
    scheduledAt: NOW - counter * 1000,
    ...extra
  };
};

function run(rows: ReturnType<typeof row>[], direct: number[] = []) {
  return channelPosts(
    {
      publicationOutcomes: { outcomes: async () => [], latestForPost: async () => null, recent: async () => rows },
      rubricChannelPosts: { record: async () => undefined, since: async () => direct, purge: async () => 0 }
    },
    DEST,
    new Set(),
    NOW,
    NOW - 86_400_000
  );
}

describe('channelPosts', () => {
  it('counts the automatic news and marks the owner’s posts gap-only', async () => {
    const posts = await run([row({ actor: AUTOPUBLISH_ACTOR }), row({ actor: '111' })]);
    expect(posts.map((post) => post.owner === true)).toEqual([false, true]);
  });

  it('ignores posts to other channels', async () => {
    expect(await run([row({ destinationId: 'dest-other' })])).toEqual([]);
  });

  it('counts a series (picture, then its poll) once', async () => {
    const posts = await run([
      row({ actor: AUTOPUBLISH_ACTOR, seriesPosition: 1, hasMedia: true }),
      row({ actor: AUTOPUBLISH_ACTOR, seriesPosition: 2, postKind: 'poll' })
    ]);
    expect(posts).toHaveLength(1);
  });

  it('keeps the gap after a post sent straight to the channel without counting it', async () => {
    const posts = await run([], [NOW - 3_600_000]);
    expect(posts).toEqual([
      { at: NOW - 3_600_000, weight: 'L', rubric: null, interactive: false, family: null, owner: true }
    ]);
  });

  it('counts our own rubric posts a slot does not cover like the news', async () => {
    const posts = await run([row({ actor: RUBRIC_ACTOR })]);
    expect(posts[0]?.owner).toBeUndefined();
  });
});
