import { mskParts } from '../../../shared/msk-time';
import {
  THEMES_COMMENT_CHARS,
  THEMES_LEASE_MS,
  THEMES_MAX_COMMENTS,
  THEMES_MIN_COMMENTS,
  THEMES_PER_POST
} from '../constants';
import { validateThemes } from '../domain/theme-validate';
import type { ThemesRepository } from './ports';

// The daily `summary` step (area-backend-analytics.md §8): one AI call at most per Moscow day over the rubric posts
// whose comments are frozen and not themed yet. The run row is claimed first, so two deliveries make one call.

export interface ThemeCandidate {
  chatId: string;
  messageId: number;
  rubric: string;
  /** Oldest first; text already sanitised by the audience module. */
  comments: { text: string; author: string }[];
}

export type ThemesOutcome = 'done' | 'skipped' | 'failed' | 'busy';

export async function summarizeCommentThemes(deps: {
  themes: ThemesRepository;
  candidates: () => Promise<ThemeCandidate[]>;
  /** False on DEV (no AI there): the run is skipped. */
  aiAllowed: boolean;
  classify: (
    comments: { i: number; post: number; t: string }[]
  ) => Promise<{ answer: unknown; model: string | null; errorCode: string | null }>;
  now: number;
}): Promise<{ outcome: ThemesOutcome; errorCode?: string; posts?: number }> {
  const { themes, now } = deps;
  const day = mskParts(now).day;
  if (!(await themes.claimRun(day, now, THEMES_LEASE_MS))) return { outcome: 'busy' };
  const finish = async (
    status: 'done' | 'failed' | 'skipped',
    extra: { errorCode?: string; model?: string; inputComments?: number } = {}
  ) => {
    await themes.finishRun(day, { status, ...extra }, now);
    return { outcome: status, ...(extra.errorCode === undefined ? {} : { errorCode: extra.errorCode }) };
  };
  if (!deps.aiAllowed) return finish('skipped', { errorCode: 'NO_AI_ON_DEV' });

  const candidates = await deps.candidates();
  const posts: { candidate: ThemeCandidate; limited: boolean; ids: number[] }[] = [];
  const sent: { i: number; post: number; t: string }[] = [];
  for (const candidate of candidates) {
    if (sent.length >= THEMES_MAX_COMMENTS) break;
    const seen = new Set<string>();
    const unique = candidate.comments.filter((comment) => {
      const key = comment.text.toLowerCase().replace(/\s+/g, ' ').trim();
      if (key.length === 0 || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    // The first 20 and 20 more spread over the rest: early and late voices both.
    const picked =
      unique.length <= THEMES_PER_POST
        ? unique
        : [
            ...unique.slice(0, 20),
            ...Array.from({ length: 20 }, (_, k) => unique[20 + Math.floor((k * (unique.length - 20)) / 20)]).filter(
              (comment): comment is ThemeCandidate['comments'][number] => comment !== undefined
            )
          ];
    const room = THEMES_MAX_COMMENTS - sent.length;
    const taken = picked.slice(0, room);
    const index = posts.length;
    const ids: number[] = [];
    for (const comment of taken) {
      ids.push(sent.length);
      sent.push({ i: sent.length, post: index, t: comment.text.slice(0, THEMES_COMMENT_CHARS) });
    }
    posts.push({ candidate, limited: taken.length < candidate.comments.length, ids });
  }
  if (sent.length < THEMES_MIN_COMMENTS) return finish('skipped', { errorCode: 'FEW', inputComments: sent.length });

  const { answer, model, errorCode } = await deps.classify(sent);
  if (errorCode !== null || answer === null)
    return finish('failed', {
      errorCode: errorCode ?? 'AI_BAD_FORMAT',
      inputComments: sent.length,
      ...(model === null ? {} : { model })
    });
  const valid = validateThemes(answer, sent);
  if (valid === null)
    return finish('failed', {
      errorCode: 'AI_BAD_FORMAT',
      inputComments: sent.length,
      ...(model === null ? {} : { model })
    });

  await themes.insert(
    posts.flatMap((post, index) => {
      const result = valid.get(index);
      if (result === undefined) return [];
      return [
        {
          chatId: post.candidate.chatId,
          messageId: post.candidate.messageId,
          rubric: post.candidate.rubric,
          runDay: day,
          comments: post.candidate.comments.length,
          commenters: new Set(post.candidate.comments.map((comment) => comment.author)).size,
          limited: post.limited,
          kinds: result.kinds,
          topics: result.topics,
          quote: result.quote,
          createdAt: now
        }
      ];
    })
  );
  const done = await finish('done', { inputComments: sent.length, ...(model === null ? {} : { model }) });
  return { ...done, posts: posts.length };
}
