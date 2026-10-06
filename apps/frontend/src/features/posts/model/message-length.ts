import { POST_BODY_MAX } from '@alexeev/contracts';

/** The dispatcher sends «title, blank line, body» as one message: Telegram's limit applies to all of it. */
export const MESSAGE_LIMIT = POST_BODY_MAX;
const SEPARATOR_LENGTH = 2;

/** UTF-16 code units, like the server: never undercounts. An empty body sends the title alone. */
export function messageLength(title: string, body: string): number {
  const trimmed = title.trim();
  return body.length === 0 ? trimmed.length : trimmed.length + SEPARATOR_LENGTH + body.length;
}

export function messageOverflow(title: string, body: string): number {
  return Math.max(0, messageLength(title, body) - MESSAGE_LIMIT);
}
