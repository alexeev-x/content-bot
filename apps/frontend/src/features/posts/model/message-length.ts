import { POST_BODY_MAX } from '@alexeev/contracts';
import { previewMessage } from './preview-message';

/** The dispatcher sends «title, blank line, body» as one message: Telegram's limit applies to all of it. */
export const MESSAGE_LIMIT = POST_BODY_MAX;

/** UTF-16 code units, like the server: never undercounts. An empty body sends the title alone. */
export function messageLength(title: string, body: string): number {
  return previewMessage(title, body, []).text.length;
}

export function messageOverflow(title: string, body: string, limit: number = MESSAGE_LIMIT): number {
  return Math.max(0, messageLength(title, body) - limit);
}
