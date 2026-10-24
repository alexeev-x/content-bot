import { POST_TITLE_MAX } from '@alexeev/contracts';

const NAME_MAX = 80;
const EMPTY_NAME = 'Без текста';

/**
 * The studio name of a post without a title (owner, 16.10.2026): the first non-empty line of its body, cut to
 * 80 characters. Lists, search and the bot's notices read it; the channel never receives it.
 */
export function postNameFromBody(body: string): string {
  const line =
    body
      .split('\n')
      .map((part) => part.replace(/\s+/g, ' ').trim())
      .find((part) => part !== '') ?? '';
  if (line === '') return EMPTY_NAME;
  const chars = [...line];
  const max = Math.min(NAME_MAX, POST_TITLE_MAX);
  return chars.length > max
    ? `${chars
        .slice(0, max - 1)
        .join('')
        .trimEnd()}…`
    : line;
}
