import { z } from 'zod';
import { cleanText } from './text';

// A post is one Telegram message of one kind (docs/design/ux/post-composer.md §1.7): text with optional media, or a
// native poll. The kind is fixed at creation; a poll never carries a body or media.
export const postKindSchema = z.enum(['text', 'poll']);
export type PostKind = z.infer<typeof postKindSchema>;

// Bot API sendPoll limits (checked 18.10.2026): question 1–300, option 1–100, at most 12 options, explanation 0–200
// with at most 2 line feeds. We ask for at least 2 options: a one-option poll is not a question.
export const POLL_QUESTION_MAX = 300;
export const POLL_OPTION_MAX = 100;
export const POLL_OPTIONS_MIN = 2;
export const POLL_OPTIONS_MAX = 12;
export const POLL_EXPLANATION_MAX = 200;
const POLL_EXPLANATION_LINE_FEEDS_MAX = 2;

// A draft poll may be incomplete (empty question, blank options) so autosave never fights the owner while they type;
// `pollIssue` is the gate on approve and on send. Lengths are capped even in a draft.
export const postPollSchema = z.strictObject({
  question: z
    .string()
    .max(POLL_QUESTION_MAX)
    .refine(cleanText(false), { error: 'Question contains forbidden characters' }),
  options: z
    .array(z.string().max(POLL_OPTION_MAX).refine(cleanText(false), { error: 'Option contains forbidden characters' }))
    .max(POLL_OPTIONS_MAX),
  allowsMultipleAnswers: z.boolean().default(false),
  /** Quiz mode: exactly one correct option; Telegram shows the explanation after a wrong answer. Null — a regular poll. */
  quiz: z
    .strictObject({
      correctOptionIndex: z
        .number()
        .int()
        .nonnegative()
        .max(POLL_OPTIONS_MAX - 1),
      explanation: z
        .string()
        .max(POLL_EXPLANATION_MAX)
        .refine(cleanText(true), { error: 'Explanation contains forbidden characters' })
        .default('')
    })
    .nullable()
    .default(null)
});
export type PostPoll = z.infer<typeof postPollSchema>;

export const EMPTY_POLL: PostPoll = { question: '', options: ['', ''], allowsMultipleAnswers: false, quiz: null };

export type PollIssue =
  | 'QUESTION_EMPTY'
  | 'TOO_FEW_OPTIONS'
  | 'OPTION_EMPTY'
  | 'OPTION_DUPLICATE'
  | 'QUIZ_MULTIPLE_ANSWERS'
  | 'QUIZ_ANSWER_MISSING'
  | 'EXPLANATION_LINE_FEEDS';

/** Why this poll cannot be sent yet, or null when Telegram will take it. Shared by the editor and the server. */
export function pollIssue(poll: PostPoll): PollIssue | null {
  if (poll.question.trim() === '') return 'QUESTION_EMPTY';
  if (poll.options.length < POLL_OPTIONS_MIN) return 'TOO_FEW_OPTIONS';
  const options = poll.options.map((option) => option.trim());
  if (options.some((option) => option === '')) return 'OPTION_EMPTY';
  if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) return 'OPTION_DUPLICATE';
  if (poll.quiz !== null) {
    if (poll.allowsMultipleAnswers) return 'QUIZ_MULTIPLE_ANSWERS';
    if (poll.quiz.correctOptionIndex >= options.length) return 'QUIZ_ANSWER_MISSING';
    if ((poll.quiz.explanation.match(/\n/g)?.length ?? 0) > POLL_EXPLANATION_LINE_FEEDS_MAX) {
      return 'EXPLANATION_LINE_FEEDS';
    }
  }
  return null;
}

// Per-post Telegram send options (owner, 18.10.2026), snapshotted with the approved revision like the text.
// `linkPreview` applies to a text message without media only; a caption or a poll has no link preview.
export const postSendOptionsSchema = z.strictObject({
  /** disable_notification: subscribers get the message without a sound. */
  silent: z.boolean().default(false),
  /** protect_content: the message cannot be forwarded or saved. */
  protectContent: z.boolean().default(false),
  /** False (the default, as every post was sent before 18.10.2026) sends link_preview_options.is_disabled. */
  linkPreview: z.boolean().default(false)
});
export type PostSendOptions = z.infer<typeof postSendOptionsSchema>;

export const DEFAULT_SEND_OPTIONS: PostSendOptions = { silent: false, protectContent: false, linkPreview: false };
