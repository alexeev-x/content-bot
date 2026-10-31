import type { AudienceChat, AudienceRepository } from './ports';

// What the owner sees of the audience branch on «Бот» and what the daily health step decides from. Derived from the
// stored rows only: no per-update counter is written.

export type AudienceState =
  'not_checked' | 'ok' | 'bot_not_admin_in_channel' | 'no_linked_group' | 'bot_blind_in_group' | 'no_key' | 'silent';

export interface AudienceStatus {
  state: AudienceState;
  channels: {
    title: string;
    username: string | null;
    botIsAdmin: boolean;
    group: { title: string; botIsAdmin: boolean; seesAll: boolean } | null;
  }[];
  updates24h: { reactions: number; polls: number; comments: number };
  lastUpdateAt: number | null;
  checkedAt: number | null;
}

const DAY_MS = 86_400_000;

/** The first problem in the setup, in the order the owner would fix them. */
export function setupState(chats: AudienceChat[], hasKey: boolean): AudienceState {
  const channels = chats.filter((chat) => chat.role === 'channel');
  if (channels.length === 0) return 'not_checked';
  if (channels.some((chat) => !chat.botAdmin)) return 'bot_not_admin_in_channel';
  const groups = chats.filter((chat) => chat.role === 'group');
  if (channels.some((channel) => !groups.some((group) => group.channelChatId === channel.chatId)))
    return 'no_linked_group';
  if (groups.some((group) => !group.seesAll)) return 'bot_blind_in_group';
  if (!hasKey) return 'no_key';
  return 'ok';
}

export async function readAudienceStatus(
  deps: { repo: AudienceRepository; now: number; hasKey: boolean },
  options: { postedRecently: boolean } = { postedRecently: false }
): Promise<AudienceStatus> {
  const chats = await deps.repo.chats();
  const updates = await deps.repo.updatesSince(deps.now - DAY_MS);
  let state = setupState(chats, deps.hasKey);
  // Set up, the channel posted, and nothing came back in a day: the updates do not reach the bot.
  if (state === 'ok' && options.postedRecently && updates.reactions + updates.polls + updates.comments === 0)
    state = 'silent';
  const channels = chats
    .filter((chat) => chat.role === 'channel')
    .map((channel) => {
      const group = chats.find((chat) => chat.role === 'group' && chat.channelChatId === channel.chatId);
      return {
        title: channel.title,
        username: channel.username,
        botIsAdmin: channel.botAdmin,
        group: group === undefined ? null : { title: group.title, botIsAdmin: group.botAdmin, seesAll: group.seesAll }
      };
    });
  const checked = chats.map((chat) => chat.checkedAt);
  return {
    state,
    channels,
    updates24h: { reactions: updates.reactions, polls: updates.polls, comments: updates.comments },
    lastUpdateAt: updates.lastAt,
    checkedAt: checked.length === 0 ? null : Math.max(...checked)
  };
}
