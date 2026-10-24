import {
  type CreatePostInput,
  createPostInputSchema,
  POLL_EXPLANATION_MAX,
  POLL_OPTION_MAX,
  POLL_OPTIONS_MAX,
  POLL_QUESTION_MAX,
  POST_BODY_MAX,
  POST_ENTITIES_MAX,
  type PostEntity,
  postEntitySchema
} from '@alexeev/contracts';
import type { MessageEntity, Poll } from 'grammy/types';

export type DraftFromMessage =
  { ok: true; input: CreatePostInput } | { ok: false; reason: 'TOO_LONG' | 'INVALID_TEXT' };

// One UTF-16 unit of the message together with its index in the original text, so every cut and
// trim below keeps the entity offsets of Telegram (which count units of the original text) resolvable.
interface Unit {
  char: string;
  at: number;
}

const toText = (units: readonly Unit[]) => units.map((unit) => unit.char).join('');

function trimUnits(units: Unit[]): Unit[] {
  let start = 0;
  let end = units.length;
  while (start < end && /\s/.test(units[start]?.char ?? '')) start += 1;
  while (end > start && /\s/.test(units[end - 1]?.char ?? '')) end -= 1;
  return units.slice(start, end);
}

function normalizeLineBreaks(text: string): Unit[] {
  const out: Unit[] = [];
  for (let at = 0; at < text.length; at += 1) {
    const char = text.charAt(at);
    if (char === '\r') {
      // CRLF is one break: the LF carries it, the CR is dropped.
      if (text.charAt(at + 1) !== '\n') out.push({ char: '\n', at });
      continue;
    }
    out.push({ char, at });
  }
  return out;
}

function mapEntity(entity: MessageEntity): PostEntity | null {
  const range = { offset: entity.offset, length: entity.length };
  switch (entity.type) {
    case 'bold':
    case 'italic':
    case 'underline':
    case 'strikethrough':
    case 'spoiler':
    case 'code':
    case 'blockquote':
      return { type: entity.type, ...range } as PostEntity;
    case 'expandable_blockquote':
      return { type: 'blockquote', ...range };
    case 'pre':
      return entity.language === undefined || entity.language === ''
        ? { type: 'pre', ...range }
        : { type: 'pre', ...range, language: entity.language };
    case 'text_link':
      try {
        return { type: 'text_link', ...range, url: new URL(entity.url).href };
      } catch {
        return null;
      }
    default:
      // Mentions, hashtags, bare links, custom emoji and the rest are not formatting the editor stores.
      return null;
  }
}

// Moves an entity from offsets of the original text to offsets of the body. Only the units that survive
// into the body count, so an entity inside the title (or in trimmed blanks) disappears and one that
// straddles the title keeps just its part in the body.
function entitiesOfBody(entities: readonly MessageEntity[], body: readonly Unit[]): PostEntity[] {
  const out: PostEntity[] = [];
  for (const entity of entities) {
    const end = entity.offset + entity.length;
    let first = -1;
    let last = -1;
    for (let index = 0; index < body.length; index += 1) {
      const at = body[index]?.at ?? -1;
      if (at >= entity.offset && at < end) {
        if (first === -1) first = index;
        last = index;
      }
    }
    if (first === -1) continue;
    const mapped = mapEntity({ ...entity, offset: first, length: last - first + 1 });
    const parsed = postEntitySchema.safeParse(mapped);
    if (parsed.success) out.push(parsed.data);
    if (out.length === POST_ENTITIES_MAX) break;
  }
  return out;
}

// The text is kept whole, as the post's body (owner, 16.10.2026: no title — a first line read as a bold title
// broke a post that starts with a joke). The post is named after its start by the server and only the body is
// sent. Telegram formatting (`entities`, offsets in UTF-16 units) is carried over. If the contract refuses the
// carried formatting (say, an overlap the editor cannot hold), the draft keeps its text and loses only that.
export function draftFromMessageText(text: string, entities: readonly MessageEntity[] = []): DraftFromMessage {
  const body = trimUnits(normalizeLineBreaks(text));
  if (body.length > POST_BODY_MAX) return { ok: false, reason: 'TOO_LONG' };

  const bodyText = toText(body);
  // The contract schema is the one authority on what a post may hold (control characters, lone surrogates).
  const withFormatting = createPostInputSchema.safeParse({ body: bodyText, entities: entitiesOfBody(entities, body) });
  if (withFormatting.success) return { ok: true, input: withFormatting.data };
  const plain = createPostInputSchema.safeParse({ body: bodyText });
  return plain.success ? { ok: true, input: plain.data } : { ok: false, reason: 'INVALID_TEXT' };
}

// A caption is the post's text, exactly as a text message is. Without one the draft only has the media.
export function draftFromCaption(
  caption: string | undefined,
  entities: readonly MessageEntity[] = []
): DraftFromMessage {
  if (caption === undefined || caption.trim() === '') return { ok: true, input: mediaOnlyDraft() };
  return draftFromMessageText(caption, entities);
}

export function mediaOnlyDraft(): CreatePostInput {
  return { body: '', entities: [], kind: 'text' };
}

/**
 * A poll sent to the bot (owner, 20.10.2026: «чтобы с ТГ мог создавать») becomes a poll draft with the same question,
 * options, multiple answers and quiz. Telegram's own limits match ours; anything longer is cut, so the draft is still
 * made and the owner sees it in the studio. A quiz keeps its answer only when Telegram gave exactly one (it gives
 * them in the private chat with the bot); otherwise the draft is a regular poll the owner can turn back into a quiz.
 */
export function draftFromPoll(poll: Poll): DraftFromMessage {
  const cut = (value: string, max: number) => Array.from(value.trim()).slice(0, max).join('');
  const options = poll.options.slice(0, POLL_OPTIONS_MAX).map((option) => cut(option.text, POLL_OPTION_MAX));
  // Our quiz has one right answer; a quiz with several (or none given) becomes a regular poll.
  const answers = poll.correct_option_ids ?? [];
  const answer = answers.length === 1 ? answers[0] : undefined;
  const quiz =
    poll.type === 'quiz' && answer !== undefined && answer < options.length
      ? { correctOptionIndex: answer, explanation: cut(poll.explanation ?? '', POLL_EXPLANATION_MAX) }
      : null;
  const parsed = createPostInputSchema.safeParse({
    kind: 'poll',
    poll: {
      question: cut(poll.question, POLL_QUESTION_MAX),
      options,
      allowsMultipleAnswers: quiz === null && poll.allows_multiple_answers,
      quiz
    }
  });
  return parsed.success ? { ok: true, input: parsed.data } : { ok: false, reason: 'INVALID_TEXT' };
}

const URL_IN_TEXT = /https:\/\/[^\s]{1,300}/g;
/** Longest words a link may hide behind; a longer line links only its last clause. */
const LABEL_MAX = 60;
const DEFAULT_LABEL = 'Подробнее';

// The words a link hides behind: the line's text before it, or its last clause when the line is long.
function labelOf(before: string): string {
  const words = before.replace(/[\s:—–-]+$/u, '').trim();
  if (words.length <= LABEL_MAX) return words;
  const clause =
    words
      .split(/(?<=[.!?…])\s+|:\s+/u)
      .pop()
      ?.trim() ?? '';
  return clause.length > 0 && clause.length <= LABEL_MAX ? clause : '';
}

/**
 * Every address in an approved AI text hides behind its words (owner, 21.10.2026: «все ссылки вшивай в текст»):
 * «Посмотреть наборы: https://…» becomes «Посмотреть наборы» as a link; an address alone on its line links the line
 * above when that line ends with a colon («смотрите на видео:»), else becomes «Подробнее»; one inside a sentence
 * becomes «ссылка». Offsets are UTF-16 units, as Telegram counts them.
 */
export function linkTrailingSource(text: string): { text: string; entities: MessageEntity[] } {
  const lines = text.trimEnd().split('\n');
  const out: string[] = [];
  // Links per output line: start and length within that line.
  const links: { line: number; start: number; length: number; url: string }[] = [];
  for (const line of lines) {
    const urls = [...line.matchAll(URL_IN_TEXT)];
    if (urls.length === 0) {
      out.push(line);
      continue;
    }
    const first = urls[0];
    const url = first?.[0] ?? '';
    const before = line.slice(0, first?.index ?? 0);
    const after = line.slice((first?.index ?? 0) + url.length).trim();
    if (urls.length === 1 && after === '' && before.trim() === '') {
      // An address alone on its line: the line above, when it introduces it, carries the link.
      const previous = out.length - 1;
      const above = out[previous] ?? '';
      if (above.trimEnd().endsWith(':') && !links.some((link) => link.line === previous)) {
        const label = labelOf(above);
        if (label !== '') {
          const kept = above.replace(/[\s:]+$/u, '');
          out[previous] = kept;
          links.push({ line: previous, start: kept.length - label.length, length: label.length, url });
          continue;
        }
      }
      links.push({ line: out.length, start: 0, length: DEFAULT_LABEL.length, url });
      out.push(DEFAULT_LABEL);
      continue;
    }
    if (urls.length === 1 && after === '') {
      // «Label: address» at the end of a line: the label carries the link.
      const label = labelOf(before) || DEFAULT_LABEL;
      const kept =
        labelOf(before) === '' ? `${before.trimEnd()} ${DEFAULT_LABEL}`.trim() : before.replace(/[\s:—–-]+$/u, '');
      links.push({ line: out.length, start: kept.length - label.length, length: label.length, url });
      out.push(kept);
      continue;
    }
    // Addresses inside a sentence: each becomes «ссылка».
    let rebuilt = '';
    let at = 0;
    for (const match of urls) {
      rebuilt += line.slice(at, match.index);
      links.push({ line: out.length, start: rebuilt.length, length: 'ссылка'.length, url: match[0] });
      rebuilt += 'ссылка';
      at = (match.index ?? 0) + match[0].length;
    }
    out.push(rebuilt + line.slice(at));
  }
  if (links.length === 0) return { text, entities: [] };
  const starts: number[] = [];
  let offset = 0;
  for (const line of out) {
    starts.push(offset);
    offset += line.length + 1;
  }
  return {
    text: out.join('\n'),
    entities: links
      .map((link) => ({
        type: 'text_link' as const,
        offset: (starts[link.line] ?? 0) + link.start,
        length: link.length,
        url: link.url
      }))
      .sort((a, b) => a.offset - b.offset)
  };
}

// A patch post opens with «Вышел 7.41f.» in bold on its own line, then an empty line (owner, 23.10.2026). Done here,
// not by the writer: its text is plain, and a bold first line in general broke posts that open with a joke.
const PATCH_LEAD = /^(Вышел (?:патч )?\d\.\d{2}[a-z]?\.)[ \t]*(?:\n[ \t]*)*/u;

/** An approved AI text as a post: the patch lead in bold, the trailing source as a link, «```diff» blocks as code. */
export function aiPostText(text: string): { text: string; entities: MessageEntity[] } {
  const lead = PATCH_LEAD.exec(text);
  if (lead === null) return withDiffBlocks(linkTrailingSource(text));
  const head = lead[1] ?? '';
  const rest = text.slice(lead[0].length);
  if (rest.trim() === '') return withDiffBlocks(linkTrailingSource(text));
  const linked = linkTrailingSource(`${head}\n\n${rest}`);
  return withDiffBlocks({
    text: linked.text,
    entities: [{ type: 'bold', offset: 0, length: head.length }, ...linked.entities]
  });
}

const FENCE_OPEN = /^```diff[ \t]*$/u;
const FENCE_CLOSE = /^```[ \t]*$/u;

/**
 * A find in the game's files shows what was removed and added as a diff, red and green in Telegram (owner,
 * 24.10.2026: «красным и зелёным как в программировании»): the writer's «```diff … ```» block becomes a `pre` entity in
 * the `diff` language and its fence lines go. An unclosed fence is left as text. Offsets are UTF-16 units.
 */
function withDiffBlocks(post: { text: string; entities: MessageEntity[] }): {
  text: string;
  entities: MessageEntity[];
} {
  const lines = post.text.split('\n');
  if (!lines.some((line) => FENCE_OPEN.test(line))) return post;
  const out: string[] = [];
  const blocks: { offset: number; length: number }[] = [];
  /** Where each removed fence line was (in the old text) and how long it was with its line break. */
  const removed: { at: number; length: number }[] = [];
  let oldOffset = 0;
  let newOffset = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const close = FENCE_OPEN.test(line) ? lines.findIndex((each, at) => at > index && FENCE_CLOSE.test(each)) : -1;
    if (close === -1) {
      out.push(line);
      oldOffset += line.length + 1;
      newOffset += line.length + 1;
      continue;
    }
    const body = lines.slice(index + 1, close);
    removed.push({ at: oldOffset, length: line.length + 1 });
    oldOffset += line.length + 1;
    const content = body.join('\n');
    if (content.trim() !== '') blocks.push({ offset: newOffset, length: content.length });
    for (const each of body) {
      out.push(each);
      oldOffset += each.length + 1;
      newOffset += each.length + 1;
    }
    const fence = lines[close] ?? '';
    removed.push({ at: oldOffset, length: fence.length + 1 });
    oldOffset += fence.length + 1;
    index = close;
  }
  const shift = (offset: number) =>
    removed.reduce((sum, cut) => (cut.at < offset ? sum + Math.min(cut.length, offset - cut.at) : sum), 0);
  const text = out.join('\n').replace(/\n+$/u, '');
  return {
    text,
    entities: [
      ...post.entities.map((entity) => ({ ...entity, offset: entity.offset - shift(entity.offset) })),
      ...blocks.map((block) => ({ type: 'pre' as const, offset: block.offset, length: block.length, language: 'diff' }))
    ].sort((a, b) => a.offset - b.offset)
  };
}
