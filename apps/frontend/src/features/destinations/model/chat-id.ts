import { checkDestinationInputSchema } from '@alexeev/contracts';

const BARE_USERNAME = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;
const LINK_PREFIX = /^(?:https?:\/\/)?(?:t|telegram)\.me\//i;

/** Turns what an operator pastes (`name`, `@name`, `t.me/name`, `-100…`) into the one spelling the API accepts. */
export function normalizeChatId(raw: string): string {
  const trimmed = raw.trim().replace(LINK_PREFIX, '').replace(/\/+$/, '');
  return BARE_USERNAME.test(trimmed) ? `@${trimmed}` : trimmed;
}

/** Returns the normalized id, or `null` when the contract would refuse it (client validation is UX only). */
export function parseChatId(raw: string): string | null {
  const parsed = checkDestinationInputSchema.safeParse({ chatId: normalizeChatId(raw) });
  return parsed.success ? parsed.data.chatId : null;
}

export function displayChatId(chatId: string): string {
  return chatId.startsWith('@') ? chatId : `ID ${chatId}`;
}
