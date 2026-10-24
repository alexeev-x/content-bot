import {
  CONTENT_REPORT_ITEM_LIMIT,
  type ContentRubricDto,
  type ContentRubricsDto,
  type ContentReportPeriod
} from '@alexeev/contracts';
import type { Clock } from '../../platform/clock';
import { AppError } from '../../shared/app-error';

// Telegram rubrics against results (plan B3, migration 0089; owner, 20.10.2026: «Оба способа»): the owner's pick for
// the studio post a Telegram message was sent from wins; otherwise a marker in the post decides — the rubric's
// hashtag, or its name opening the post's first line.

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RubricRow {
  id: string;
  name: string;
  tag: string | null;
}

export interface TelegramItemRow {
  id: string;
  title: string;
  /** JSON array of the post's hashtags as stored; null before migration 0089. */
  tags: string | null;
}

export interface ContentRubricRepository {
  list(): Promise<RubricRow[]>;
  /** Adds the rubric unless CONTENT_RUBRICS_MAX exist; false at the limit. Throws CONFLICT on a taken name or tag. */
  create(input: RubricRow & { now: number; max: number }): Promise<boolean>;
  /** False when the rubric is gone. Throws CONFLICT on a taken name or tag. */
  update(input: RubricRow): Promise<boolean>;
  remove(id: string): Promise<void>;
  postRubric(postId: string): Promise<string | null>;
  /** Picks (or with null clears) a studio post's rubric. Throws NOT_FOUND for an unknown post or rubric. */
  setPostRubric(input: { postId: string; rubricId: string | null; now: number }): Promise<void>;
  /** The owner's picks among these posts (at most 100). */
  postRubrics(postIds: readonly string[]): Promise<Map<string, string>>;
  /** Telegram posts published since `from`, newest first, at most `limit`. */
  telegramItems(from: number, limit: number): Promise<TelegramItemRow[]>;
}

/**
 * The studio posts the analytics channel's messages were sent from. Owned here, implemented by the publishing module
 * (wired in app/container.ts): only a destination saved as the channel's @username is matched, so a test channel's
 * message numbers never land on the real channel's posts.
 */
export interface StudioTelegramMessages {
  postsOfMessages(input: {
    channel: string;
    messageIds: readonly string[];
  }): Promise<{ messageId: string; postId: string }[]>;
}

const normalize = (value: string) => value.toLocaleLowerCase('ru-RU').replaceAll('ё', 'е');

/** A rubric name's unique key: SQLite's NOCASE folds only ASCII, so «Вердикт» and «вердикт» are folded here. */
export const rubricKey = (name: string) => normalize(name.trim());

// Emoji, quotes and punctuation that may open a post before the rubric's name («🎯 Вердикт чата: …»).
const LEADING = /^[^\p{L}\p{N}]+/u;
const LETTER = /[\p{L}\p{N}]/u;

function parseTags(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === 'string').map(normalize) : [];
  } catch {
    return [];
  }
}

/**
 * The rubric a post's own text points to: a rubric hashtag first, then the longest rubric name opening the first
 * line as a whole word. Null when none does.
 */
export function markerRubric(
  item: { title: string; tags: string | null },
  rubrics: readonly RubricRow[]
): string | null {
  const tags = parseTags(item.tags);
  const byTag = rubrics.find((rubric) => rubric.tag !== null && tags.includes(normalize(rubric.tag)));
  if (byTag !== undefined) return byTag.id;
  const line = normalize(item.title).replace(LEADING, '');
  const byName = rubrics
    .filter((rubric) => {
      // Emoji or quotes opening the name are skipped as they are in the post («🎯 Вердикт» matches «Вердикт: …»).
      const name = normalize(rubric.name.trim()).replace(LEADING, '');
      if (name === '') return false;
      return line.startsWith(name) && !LETTER.test(line.charAt(name.length));
    })
    .sort((a, b) => b.name.length - a.name.length)[0];
  return byName?.id ?? null;
}

/** Each Telegram post of the report's window with its rubric: the studio pick, else a marker. */
export async function readRubrics(
  deps: {
    rubrics: ContentRubricRepository;
    studio: StudioTelegramMessages;
    channel: string | null;
    clock: Clock;
  },
  input: { days: ContentReportPeriod | undefined }
): Promise<ContentRubricsDto> {
  const rubrics = await deps.rubrics.list();
  // Without a period only the names are asked for (settings, the editor): no posts are read.
  if (rubrics.length === 0 || input.days === undefined) return { rubrics: rubrics.map(toDto), items: [] };
  // The report compares this period with the previous one of the same length.
  const items = await deps.rubrics.telegramItems(deps.clock.now() - 2 * input.days * DAY_MS, CONTENT_REPORT_ITEM_LIMIT);
  const picks = new Map<string, string>();
  if (deps.channel !== null && items.length > 0) {
    const messageIds = items.map((item) => item.id.slice('telegram:'.length));
    const sent: { messageId: string; postId: string }[] = [];
    // Bounded statements: 100 message ids each.
    for (let start = 0; start < messageIds.length; start += 100) {
      sent.push(
        ...(await deps.studio.postsOfMessages({
          channel: deps.channel,
          messageIds: messageIds.slice(start, start + 100)
        }))
      );
    }
    const postIds = [...new Set(sent.map((row) => row.postId))];
    const chosen = new Map<string, string>();
    for (let start = 0; start < postIds.length; start += 100) {
      for (const [postId, rubricId] of await deps.rubrics.postRubrics(postIds.slice(start, start + 100)))
        chosen.set(postId, rubricId);
    }
    for (const row of sent) {
      const rubricId = chosen.get(row.postId);
      if (rubricId !== undefined) picks.set(`telegram:${row.messageId}`, rubricId);
    }
  }
  const assigned: ContentRubricsDto['items'] = [];
  for (const item of items) {
    const studio = picks.get(item.id);
    if (studio !== undefined) {
      assigned.push({ itemId: item.id, rubricId: studio, source: 'studio' });
      continue;
    }
    const marker = markerRubric(item, rubrics);
    if (marker !== null) assigned.push({ itemId: item.id, rubricId: marker, source: 'marker' });
  }
  return { rubrics: rubrics.map(toDto), items: assigned };
}

const toDto = (row: RubricRow): ContentRubricDto => ({ id: row.id, name: row.name, tag: row.tag });

export async function createRubric(
  deps: { rubrics: ContentRubricRepository; clock: Clock },
  input: { name: string; tag: string | null; max: number }
): Promise<ContentRubricDto> {
  const row = { id: crypto.randomUUID(), name: input.name, tag: input.tag };
  if (!(await deps.rubrics.create({ ...row, now: deps.clock.now(), max: input.max })))
    throw new AppError('CONFLICT', 'Too many rubrics', { reason: 'LIMIT' });
  return toDto(row);
}

export async function updateRubric(
  deps: { rubrics: ContentRubricRepository },
  input: RubricRow
): Promise<ContentRubricDto> {
  if (!(await deps.rubrics.update(input))) throw new AppError('NOT_FOUND', 'Rubric not found');
  return toDto(input);
}

export async function removeRubric(deps: { rubrics: ContentRubricRepository }, id: string): Promise<void> {
  await deps.rubrics.remove(id);
}

export async function readPostRubric(
  deps: { rubrics: ContentRubricRepository },
  postId: string
): Promise<{ rubricId: string | null }> {
  return { rubricId: await deps.rubrics.postRubric(postId) };
}

export async function setPostRubric(
  deps: { rubrics: ContentRubricRepository; clock: Clock },
  input: { postId: string; rubricId: string | null }
): Promise<{ rubricId: string | null }> {
  await deps.rubrics.setPostRubric({ ...input, now: deps.clock.now() });
  return { rubricId: input.rubricId };
}
