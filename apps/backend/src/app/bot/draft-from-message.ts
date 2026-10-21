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

const TRAILING_LINK = /(?:^|\n)([^\n]{0,40}?)[ \t]*:?[ \t]*(https:\/\/[^\s]{1,300})[ \t]*$/;

/**
 * An approved AI text that ends with a link line («Подробности: https://…») hides the address behind its word
 * (owner, 21.10.2026: «нажимали на одно слово»): the line becomes that word as a text link, «Подробнее» when the
 * line is a bare address. Any other text is returned as it is.
 */
export function linkTrailingSource(text: string): { text: string; entities: MessageEntity[] } {
  const trimmed = text.trimEnd();
  const match = TRAILING_LINK.exec(trimmed);
  if (match === null) return { text, entities: [] };
  const [, rawLabel = '', url = ''] = match;
  const label = rawLabel.trim() === '' ? 'Подробнее' : rawLabel.trim();
  const start = trimmed.length - match[0].length + (match[0].startsWith('\n') ? 1 : 0);
  return {
    text: `${trimmed.slice(0, start)}${label}`,
    entities: [{ type: 'text_link', offset: start, length: label.length, url }]
  };
}
