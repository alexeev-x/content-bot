import { mskParts } from '../../../shared/msk-time';
import { COMMENT_KINDS, type CommentKind, DAY_MS, SCORE_READY_MS } from '../constants';
import { compareRubrics, groupBy, heatCells, rubricSlices } from '../domain/aggregate';
import { median, round2 } from '../domain/stats';
import { partsOf, type ScoreRow } from '../domain/types';
import { mondayWeekday } from './score-posts';
import type { RubricPostSource, ScoreRepository, ScoreSources, ThemesRepository } from './ports';

// The «Рубрики» → «Аналитика» reads (area-backend-analytics.md §7, §12): computed on request from at most ~1000 score
// rows and the scheduler's sent posts, no cache.

const READ_LIMIT = 1000;

export interface ReadDeps {
  scores: ScoreRepository;
  sources: ScoreSources;
  now: number;
  url: (messageId: number) => string | null;
}

const iso = (ms: number) => new Date(ms).toISOString();

function coverage(sent: readonly RubricPostSource[], scored: ReadonlySet<number>, now: number) {
  let pending = 0;
  let missing = 0;
  for (const post of sent) {
    if (scored.has(post.messageId)) continue;
    if (post.sentAt > now - SCORE_READY_MS) pending += 1;
    else missing += 1;
  }
  return { sent: sent.length, scored: sent.length - pending - missing, pending, missing };
}

export async function readRubricCompare(deps: ReadDeps, days: number) {
  const { now } = deps;
  const from = now - days * DAY_MS;
  const [current, previous, sent, channelSamples] = await Promise.all([
    deps.scores.bySent({ from, to: now }, READ_LIMIT),
    deps.scores.bySent({ from: from - days * DAY_MS, to: from }, READ_LIMIT),
    deps.sources.sentRubricPosts(from, now, 500),
    deps.sources.channelSamples({ from: now - 28 * DAY_MS, to: now })
  ]);
  const heatRows = days >= 90 ? current : await deps.scores.bySent({ from: now - 90 * DAY_MS, to: now }, READ_LIMIT);
  const ours = sent.filter((post) => post.channel === deps.sources.channel);
  const compared = compareRubrics(current, previous);
  const sentBy = groupBy(
    ours.filter((post) => post.role === 'main'),
    (post) => post.rubric
  );
  const rows = compared.map((row) => ({ ...row, posts: sentBy.get(row.rubric)?.length ?? row.scored }));
  for (const [rubric, posts] of sentBy) {
    if (rows.some((row) => row.rubric === rubric)) continue;
    rows.push({
      rubric,
      posts: posts.length,
      scored: 0,
      enough: false,
      x: null,
      xPrev: null,
      parts: { views: null, reactions: null, comments: null, votes: null },
      rank: null,
      mark: null,
      reason: null
    });
  }
  const baseline = channelSamples.filter((row) => row.v24h !== null && !row.contaminated);
  const viewsMedian = median(baseline.map((row) => row.v24h));
  return {
    days,
    asOf: iso(now),
    from: iso(from),
    to: iso(now),
    channel: { baselinePosts: baseline.length, viewsMedian24: viewsMedian === null ? null : Math.round(viewsMedian) },
    rows,
    hours: { cells: heatCells(heatRows) },
    coverage: coverage(ours, new Set(current.map((row) => row.messageId)), now)
  };
}

export async function readRubricPosts(deps: ReadDeps, rubric: string, days: '30' | '90' | 'all') {
  const { now } = deps;
  const from = days === 'all' ? 0 : now - Number(days) * DAY_MS;
  const [scored, sent] = await Promise.all([
    deps.scores.bySent({ from, to: now, rubric }, READ_LIMIT),
    deps.sources.sentRubricPosts(Math.max(from, now - 365 * DAY_MS), now, 500)
  ]);
  const main = scored.filter((row) => row.role === 'main');
  const usualRaw = median(main.map((row) => row.composite));
  const byMessage = new Map(scored.map((row) => [row.messageId, row]));
  const mine = sent.filter((post) => post.rubric === rubric && post.channel === deps.sources.channel);
  const known = new Set(mine.map((post) => post.messageId));
  const items = [
    ...mine.map((post) => postItem(post, byMessage.get(post.messageId), usualRaw, now, deps.url)),
    // Scored rows whose slot is older than the sent list reaches.
    ...scored.filter((row) => !known.has(row.messageId)).map((row) => scoredItem(row, usualRaw, deps.url))
  ].sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  const ranked = [...main].sort((a, b) => b.composite - a.composite);
  return {
    rubric,
    days,
    asOf: iso(now),
    usual: round2(usualRaw),
    counts: coverage(mine, new Set(scored.map((row) => row.messageId)), now),
    bestMessageId: ranked.length >= 2 ? String(ranked[0]?.messageId) : null,
    worstMessageId: ranked.length >= 2 ? String(ranked.at(-1)?.messageId) : null,
    posts: items.slice(0, 200),
    truncated: items.length > 200,
    slices: usualRaw === null ? [] : rubricSlices(main, usualRaw)
  };
}

function scoredItem(row: ScoreRow, usual: number | null, url: ReadDeps['url']) {
  return {
    messageId: String(row.messageId),
    sentAt: iso(row.sentAt),
    hero: row.slices.hero,
    line: row.slices.line,
    look: row.slices.look,
    picture: row.slices.picture,
    hour: row.slices.hour,
    weekday: row.slices.weekday,
    status: 'scored' as const,
    missingReason: null,
    views24: row.views24,
    x: usual === null ? null : round2(row.composite / usual),
    xChannel: round2(row.composite),
    parts: partsOf(row),
    comments: row.comments24,
    voters: row.voters24,
    telegramUrl: url(row.messageId)
  };
}

function postItem(
  post: RubricPostSource,
  row: ScoreRow | undefined,
  usual: number | null,
  now: number,
  url: ReadDeps['url']
) {
  if (row !== undefined) return scoredItem(row, usual, url);
  const pending = post.sentAt > now - SCORE_READY_MS;
  return {
    messageId: String(post.messageId),
    sentAt: iso(post.sentAt),
    hero: post.slices.hero,
    line: post.slices.line,
    look: post.slices.look,
    picture: post.slices.picture,
    hour: mskParts(post.sentAt).hour,
    weekday: mondayWeekday(post.sentAt),
    status: pending ? ('pending' as const) : ('missing' as const),
    // The score step does not keep why a post was skipped; most often the preview did not see it from birth.
    missingReason: pending ? null : ('NOT_TRACKED_FROM_BIRTH' as const),
    views24: null,
    x: null,
    xChannel: null,
    parts: { views: null, reactions: null, comments: null, votes: null },
    comments: null,
    voters: null,
    telegramUrl: url(post.messageId)
  };
}

export async function readRubricComments(
  deps: ReadDeps & { themes: ThemesRepository; audienceConnected: boolean; textKeptDays: number },
  days: number,
  rubric?: string
) {
  const { now } = deps;
  const since = now - days * DAY_MS;
  const [themes, scores, lastRun] = await Promise.all([
    deps.themes.since(since, rubric),
    deps.scores.bySent({ from: since, to: now, ...(rubric === undefined ? {} : { rubric }) }, READ_LIMIT),
    deps.themes.lastRun()
  ]);
  const scoresBy = groupBy(
    scores.filter((row) => row.role === 'main'),
    (row) => row.rubric
  );
  const rows = [...groupBy(themes, (row) => row.rubric)].map(([key, list]) => {
    const kinds = Object.fromEntries(COMMENT_KINDS.map((kind) => [kind, 0])) as Record<CommentKind, number>;
    const topics = new Map<string, number>();
    for (const theme of list) {
      for (const kind of COMMENT_KINDS) kinds[kind] += theme.kinds[kind];
      for (const topic of theme.topics) topics.set(topic.label, (topics.get(topic.label) ?? 0) + topic.count);
    }
    return {
      rubric: key,
      posts: list.length,
      comments: list.reduce((total, theme) => total + theme.comments, 0),
      xComments: round2(median((scoresBy.get(key) ?? []).map((row) => row.xComments))),
      kinds,
      topics: [...topics]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([label, count]) => ({ label, count })),
      quote: list.find((theme) => theme.quote !== null)?.quote ?? null,
      limited: list.some((theme) => theme.limited)
    };
  });
  const weekTopics = new Map<string, number>();
  for (const theme of themes.filter((row) => row.createdAt >= now - 7 * DAY_MS))
    for (const topic of theme.topics) weekTopics.set(topic.label, (weekTopics.get(topic.label) ?? 0) + topic.count);
  const state = !deps.audienceConnected
    ? ('not_connected' as const)
    : rows.length === 0
      ? lastRun?.status === 'failed' && lastRun.errorCode === 'AI_UNAVAILABLE'
        ? ('ai_unavailable' as const)
        : ('no_data' as const)
      : rows.some((row) => row.limited)
        ? ('limited' as const)
        : ('ok' as const);
  return {
    asOf: iso(now),
    state,
    textKeptDays: deps.textKeptDays,
    rubrics: rows,
    weekTopics: [...weekTopics]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([label, count]) => ({ label, count, kind: null }))
  };
}
