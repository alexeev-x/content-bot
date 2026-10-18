import { POLL_OPTIONS_MAX, POLL_OPTIONS_MIN, type PostPoll } from '@alexeev/contracts';

/** Pure edits of a draft poll; the editor keeps the result in its form state and the server re-validates it. */

export const samePoll = (a: PostPoll, b: PostPoll): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Nothing typed or switched yet: a new post with such a poll is not worth a draft on the server. */
export function isPollBlank(poll: PostPoll): boolean {
  return (
    poll.question.trim() === '' &&
    poll.options.every((option) => option.trim() === '') &&
    !poll.allowsMultipleAnswers &&
    poll.quiz === null
  );
}

export const canAddOption = (poll: PostPoll): boolean => poll.options.length < POLL_OPTIONS_MAX;
export const canRemoveOption = (poll: PostPoll): boolean => poll.options.length > POLL_OPTIONS_MIN;

export function setOption(poll: PostPoll, index: number, text: string): PostPoll {
  return { ...poll, options: poll.options.map((option, at) => (at === index ? text : option)) };
}

export function addOption(poll: PostPoll): PostPoll {
  return canAddOption(poll) ? { ...poll, options: [...poll.options, ''] } : poll;
}

/** The correct answer of a quiz follows its option when the list changes. */
export function removeOption(poll: PostPoll, index: number): PostPoll {
  if (!canRemoveOption(poll)) return poll;
  const options = poll.options.filter((_, at) => at !== index);
  if (poll.quiz === null) return { ...poll, options };
  const correct = poll.quiz.correctOptionIndex;
  const next = correct === index ? 0 : correct > index ? correct - 1 : correct;
  return { ...poll, options, quiz: { ...poll.quiz, correctOptionIndex: next } };
}

/** Takes the option at `from` out and puts it at `to`; the others close up. The quiz answer follows its option. */
export function moveOption(poll: PostPoll, from: number, to: number): PostPoll {
  if (from === to || to < 0 || to >= poll.options.length || from < 0 || from >= poll.options.length) return poll;
  const options = moveItem(poll.options, from, to);
  if (poll.quiz === null) return { ...poll, options };
  const order = moveItem(
    poll.options.map((_, at) => at),
    from,
    to
  );
  return { ...poll, options, quiz: { ...poll.quiz, correctOptionIndex: order.indexOf(poll.quiz.correctOptionIndex) } };
}

export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved !== undefined) next.splice(to, 0, moved);
  return next;
}

export type PollFieldErrors = { question: boolean; options: ('empty' | 'duplicate' | null)[]; tooFew: boolean };

/** Which fields stop the poll from being sent, shown on each field after «К публикации» (owner, 18.10.2026). */
export function pollFieldErrors(poll: PostPoll): PollFieldErrors {
  const seen = new Set<string>();
  return {
    question: poll.question.trim() === '',
    options: poll.options.map((option) => {
      const text = option.trim().toLowerCase();
      if (text === '') return 'empty';
      if (seen.has(text)) return 'duplicate';
      seen.add(text);
      return null;
    }),
    tooFew: poll.options.length < POLL_OPTIONS_MIN
  };
}

export function setMultiple(poll: PostPoll, on: boolean): PostPoll {
  return poll.quiz === null ? { ...poll, allowsMultipleAnswers: on } : poll;
}

export function setQuizEnabled(poll: PostPoll, on: boolean): PostPoll {
  if (!on) return { ...poll, quiz: null };
  return poll.allowsMultipleAnswers ? poll : { ...poll, quiz: poll.quiz ?? { correctOptionIndex: 0, explanation: '' } };
}

export function setCorrectOption(poll: PostPoll, index: number): PostPoll {
  return poll.quiz === null ? poll : { ...poll, quiz: { ...poll.quiz, correctOptionIndex: index } };
}

export function setExplanation(poll: PostPoll, explanation: string): PostPoll {
  return poll.quiz === null ? poll : { ...poll, quiz: { ...poll.quiz, explanation } };
}
