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

export function moveOption(poll: PostPoll, index: number, delta: -1 | 1): PostPoll {
  const target = index + delta;
  if (target < 0 || target >= poll.options.length) return poll;
  const options = [...poll.options];
  const [moved] = options.splice(index, 1);
  options.splice(target, 0, moved ?? '');
  if (poll.quiz === null) return { ...poll, options };
  const correct = poll.quiz.correctOptionIndex;
  const next = correct === index ? target : correct === target ? index : correct;
  return { ...poll, options, quiz: { ...poll.quiz, correctOptionIndex: next } };
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
