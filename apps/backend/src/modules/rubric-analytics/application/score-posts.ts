import { mskParts } from '../../../shared/msk-time';
import {
  BASELINE_WINDOW_MS,
  LATE_FILL_MS,
  SCORE_BATCH,
  SCORE_LOOKBACK_MS,
  SCORE_READY_MS,
  SCORE_VERSION,
  VOTE_BASELINE_WINDOW_MS
} from '../constants';
import { type BaselinePost, scorePost } from '../domain/score';
import type { ScoreRow } from '../domain/types';
import type { ChannelSample, RubricPostSource, ScoreRepository, ScoreSources } from './ports';

// The `score` step (area-backend-analytics.md §6.4): every rubric post of the analytics channel that is 25.5 h old
// and not scored yet gets one row; the 72 h numbers fill the same row later. Idempotent: the row's key is the
// channel's message, inserted with OR IGNORE.

export type ScoreSkipReason = 'OTHER_CHANNEL' | 'NOT_TRACKED_FROM_BIRTH' | 'NO_BASELINE' | 'CONTAMINATED' | 'NO_VIEWS';

export interface ScoreResult {
  scored: number;
  skipped: Partial<Record<ScoreSkipReason, number>>;
  lateFilled: number;
}

/** Monday 0 … Sunday 6 in Moscow. */
export const mondayWeekday = (utc: number) => (mskParts(utc).weekday + 6) % 7;

export async function scoreRubricPosts(deps: {
  sources: ScoreSources;
  scores: ScoreRepository;
  now: number;
}): Promise<ScoreResult> {
  const { sources, scores, now } = deps;
  const result: ScoreResult = { scored: 0, skipped: {}, lateFilled: 0 };
  const channel = sources.channel;
  if (channel === null) return result;
  const skip = (reason: ScoreSkipReason) => {
    result.skipped[reason] = (result.skipped[reason] ?? 0) + 1;
  };

  const sent = await sources.sentRubricPosts(now - SCORE_LOOKBACK_MS, now - SCORE_READY_MS, 100);
  const ours = sent.filter((post) => {
    if (post.channel === channel) return true;
    skip('OTHER_CHANNEL');
    return false;
  });
  if (ours.length > 0) {
    const done = await scores.scoredKeys(
      channel,
      ours.map((post) => post.messageId)
    );
    const todo = ours.filter((post) => !done.has(post.messageId)).slice(0, SCORE_BATCH);
    if (todo.length > 0) {
      const rows = await scoreBatch(sources, channel, todo, skip);
      result.scored = rows.length === 0 ? 0 : await scores.insert(rows);
    }
  }
  result.lateFilled = await fillLate(sources, scores, now);
  return result;
}

async function scoreBatch(
  sources: ScoreSources,
  channel: string,
  todo: RubricPostSource[],
  skip: (reason: ScoreSkipReason) => void
): Promise<(ScoreRow & { version: number; base: object })[]> {
  const first = Math.min(...todo.map((post) => post.sentAt));
  const last = Math.max(...todo.map((post) => post.sentAt));
  const pollIds = todo.flatMap((post) => (post.pollMessageId === null ? [] : [post.pollMessageId]));
  const [own, window, comments, windowComments, voters, polls] = await Promise.all([
    sources.channelSamples({ messageIds: todo.map((post) => post.messageId) }),
    sources.channelSamples({ from: first - BASELINE_WINDOW_MS, to: last }),
    sources.comments(todo.map((post) => post.messageId)),
    sources.commentsInRange(first - BASELINE_WINDOW_MS, last),
    sources.pollVoters(pollIds),
    sources.pollsInRange(first - VOTE_BASELINE_WINDOW_MS, last)
  ]);
  const pollViews = await sources.channelSamples({ messageIds: polls.map((poll) => poll.messageId).slice(0, 200) });
  const viewsOfPoll = new Map(pollViews.map((sample) => [sample.messageId, sample]));
  const samples = new Map(own.map((sample) => [sample.messageId, sample]));
  const rows: (ScoreRow & { version: number; base: object })[] = [];

  for (const post of todo) {
    const sample = samples.get(post.messageId);
    if (sample === undefined || sample.v24h === null) {
      skip('NOT_TRACKED_FROM_BIRTH');
      continue;
    }
    if (sample.contaminated) {
      skip('CONTAMINATED');
      continue;
    }
    const baseline: BaselinePost[] = window
      .filter((row) => inBaseline(row, post.sentAt, BASELINE_WINDOW_MS) && row.messageId !== post.messageId)
      .map((row) => ({
        views24: row.v24h as number,
        likes24: row.likes24,
        comments24: windowComments.get(row.messageId) ?? null
      }));
    const voteBaseline = polls.flatMap((poll) => {
      const views = viewsOfPoll.get(poll.messageId);
      return views !== undefined && inBaseline(views, post.sentAt, VOTE_BASELINE_WINDOW_MS)
        ? [{ views24: views.v24h as number, voters24: poll.voters24 }]
        : [];
    });
    const comment = comments.get(post.messageId);
    const vote = post.pollMessageId === null ? undefined : voters.get(post.pollMessageId);
    const score = scorePost(
      {
        views24: sample.v24h,
        likes24: sample.likes24,
        comments24: comment?.c24 ?? null,
        voters24: vote?.v24 ?? null
      },
      baseline,
      voteBaseline
    );
    if (typeof score === 'string') {
      skip(score);
      continue;
    }
    rows.push({
      chatId: channel,
      messageId: post.messageId,
      slotId: post.slotId,
      rubric: post.rubric,
      role: post.role,
      sentAt: post.sentAt,
      scoredAt: 0,
      views24: sample.v24h,
      likes24: sample.likes24,
      comments24: comment?.c24 ?? null,
      voters24: vote?.v24 ?? null,
      views72: null,
      xViews: score.xViews,
      xReactions: score.xReactions,
      xComments: score.xComments,
      xVotes: score.xVotes,
      composite: score.composite,
      slices: { ...post.slices, hour: mskParts(post.sentAt).hour, weekday: mondayWeekday(post.sentAt) },
      version: SCORE_VERSION,
      base: { ...score.base, poll: post.pollMessageId }
    });
  }
  return rows;
}

const inBaseline = (row: ChannelSample, sentAt: number, windowMs: number) =>
  row.v24h !== null &&
  row.v24h > 0 &&
  !row.contaminated &&
  row.publishedAt >= sentAt - windowMs &&
  row.publishedAt < sentAt;

async function fillLate(sources: ScoreSources, scores: ScoreRepository, now: number): Promise<number> {
  const late = await scores.lateRows(now - LATE_FILL_MS, SCORE_BATCH);
  if (late.length === 0) return 0;
  const ids = late.map((row) => row.messageId);
  const polls = late.flatMap((row) => (row.poll === null ? [] : [row.poll]));
  const [samples, comments, voters] = await Promise.all([
    sources.channelSamples({ messageIds: ids }),
    sources.comments(ids),
    sources.pollVoters(polls)
  ]);
  const byId = new Map(samples.map((sample) => [sample.messageId, sample]));
  const filled = late.map((row) => {
    const sample = byId.get(row.messageId);
    return {
      chatId: row.chatId,
      messageId: row.messageId,
      // 0 marks «looked, not tracked» so the row is not read again; null stays only while the sample is missing.
      views72: sample?.v72h ?? 0,
      likes72: sample?.likes72 ?? null,
      comments72: comments.get(row.messageId)?.c72 ?? null,
      voters72: row.poll === null ? null : (voters.get(row.poll)?.v72 ?? null)
    };
  });
  await scores.fillLate(filled);
  return filled.length;
}
