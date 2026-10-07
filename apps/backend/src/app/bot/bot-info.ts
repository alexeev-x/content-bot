import type { UserFromGetMe } from 'grammy/types';
import { z } from 'zod';

// Identity fields are required; capability flags only describe the bot and default to false,
// so an older or trimmed getMe copy still works.
const flag = z.boolean().default(false);
export const botInfoSchema = z.looseObject({
  id: z.number().int().positive(),
  is_bot: z.literal(true),
  first_name: z.string(),
  username: z.string(),
  can_join_groups: flag,
  can_read_all_group_messages: flag,
  supports_inline_queries: flag,
  can_connect_to_business: flag,
  has_main_web_app: flag,
  has_topics_enabled: flag,
  allows_users_to_create_topics: flag,
  can_manage_bots: flag,
  supports_join_request_queries: flag
});

export function parseBotInfoJson(raw: string): UserFromGetMe | null {
  try {
    const parsed = botInfoSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// BOT_INFO is an optional override: absent is normal, malformed is reported to the owner.
export type EnvBotInfo = { state: 'absent' } | { state: 'malformed' } | { state: 'valid'; info: UserFromGetMe };

export function parseEnvBotInfo(raw: string | undefined): EnvBotInfo {
  if (!raw) return { state: 'absent' };
  const info = parseBotInfoJson(raw);
  return info === null ? { state: 'malformed' } : { state: 'valid', info };
}
