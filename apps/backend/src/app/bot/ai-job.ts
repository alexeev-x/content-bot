import { AI_FEEDBACK_KINDS, AI_FEEDBACK_NOTE_MAX } from '@alexeev/contracts';
import { z } from 'zod';

// One model call of the bot's AI writer, sent through the AI_JOBS queue (docs/backend/bot.md «AI writer»):
// the webhook answers «Пишу…» and enqueues the job; the consumer has 15 minutes of wall time instead of the
// 30 s that `waitUntil` leaves after a response, so the model is never cut short (owner, 19.10.2026: quality
// first). The message carries only what the call needs; D1 owns every state and the job's single claim.

const TEXT_MAX = 4096;

const base = {
  /** Claimed once in D1: a queue delivers at least once, a model call is paid. */
  id: z.uuid(),
  chatId: z.number().int(),
  /** The «Пишу…» message the result replaces. */
  messageId: z.number().int().positive(),
  /** Where the «Открыть в Studio» button points; the consumer has no request to read it from. */
  appOrigin: z.string().max(200)
};

const formatSchema = z.enum(['telegram', 'fidit', 'igrat', 'standalone']);

export const aiJobSchema = z.discriminatedUnion('kind', [
  /** The AI review of a stored daily analytics report (AI plan P6): no chat message, the report row is its state. */
  z.object({ id: z.uuid(), kind: z.literal('daily_review'), reportId: z.string().min(1).max(100) }),
  /** Reading the owner's new edits and remarks into style lessons (AI plan P7c): no chat message either. */
  z.object({ id: z.uuid(), kind: z.literal('style_lessons') }),
  /** The Monday review of the analyst's hypotheses after the week's report (owner, 20.10.2026). */
  z.object({ id: z.uuid(), kind: z.literal('hypotheses'), reportId: z.string().min(1).max(100) }),
  /**
   * A Steam announcement to draft as a post (owner, 21.10.2026): Cron's new event or the owner's /events replay.
   * The consumer sends its «Пишу…» message itself, so Cron spends no Telegram call on it.
   */
  z.object({
    id: z.uuid(),
    kind: z.literal('source_event'),
    chatId: z.number().int(),
    appOrigin: z.string().max(200),
    externalId: z.string().min(1).max(100)
  }),
  /**
   * The approved post of a Dota event announcement gets the announcement's images (owner, 21.10.2026: an event post
   * always carries its picture). No model call; it rides this queue for its wall time, not the webhook's.
   */
  z.object({
    id: z.uuid(),
    kind: z.literal('source_media'),
    chatId: z.number().int(),
    postId: z.uuid(),
    externalId: z.string().min(1).max(100)
  }),
  z.object({ ...base, kind: z.literal('draft'), format: formatSchema, task: z.string().min(1).max(TEXT_MAX) }),
  z.object({
    ...base,
    kind: z.literal('rewrite'),
    generationId: z.uuid(),
    action: z.enum(['more', 'short', 'fun']),
    revisionToken: z.string().max(12)
  }),
  /** The owner answered a needs_facts question; `task` is the question's task with that answer. */
  z.object({ ...base, kind: z.literal('facts'), generationId: z.uuid(), task: z.string().min(1).max(TEXT_MAX) }),
  /**
   * «Что не так?» (plan P2): a version fixed by the owner's remark. `feedbackId` and `reason` when a reason button
   * came first (the remark is its note); otherwise the model names the reasons and the remark is recorded with them.
   */
  z.object({
    ...base,
    kind: z.literal('fix'),
    generationId: z.uuid(),
    revisionToken: z.string().max(12),
    // The note limit counts characters; an emoji is two UTF-16 units here.
    note: z
      .string()
      .min(1)
      .max(AI_FEEDBACK_NOTE_MAX * 2),
    feedbackId: z.uuid().nullable(),
    reason: z.enum(AI_FEEDBACK_KINDS).nullable()
  }),
  /** A free message in a /redactor chat; `history` is null outside a chat. */
  z.object({
    ...base,
    kind: z.literal('chat'),
    text: z.string().min(1).max(TEXT_MAX),
    history: z
      .array(z.object({ role: z.enum(['owner', 'editor']), text: z.string().max(TEXT_MAX) }))
      .max(16)
      .nullable()
  })
]);

export type AiJob = z.infer<typeof aiJobSchema>;
export type AiJobBase = z.infer<z.ZodObject<typeof base>>;
/** A `source_event` job once the consumer has sent its «Пишу…» message. */
export type EventWriterJob = AiJobBase & { kind: 'event'; externalId: string };
/** The jobs of the bot's AI writer: each has the chat message it ends in. */
export type WriterJob =
  | Exclude<AiJob, { kind: 'daily_review' | 'style_lessons' | 'hypotheses' | 'source_event' | 'source_media' }>
  | EventWriterJob;
