import { z } from 'zod';
import type { AudienceChat, AudienceRepository, AudienceTargets, AudienceTelegram } from './ports';

// Which channels the bot listens to and what it can see there: admin of the channel (reaction counts come only to
// admins), the linked discussion group and whether the bot reads it (admin, or privacy off in BotFather). At most five
// channels and four Telegram calls each; a call that fails leaves that chat out, never the whole check.

const CHANNELS_MAX = 5;
const CALL_TIMEOUT_MS = 4000;

const chatSchema = z.looseObject({
  id: z.number().int(),
  title: z.string().max(256).optional(),
  username: z.string().max(64).optional(),
  linked_chat_id: z.number().int().optional()
});
const memberSchema = z.looseObject({ status: z.string() });

export interface SetupCheckDeps {
  repo: AudienceRepository;
  targets: AudienceTargets;
  telegram: AudienceTelegram;
  /** The bot's own id and whether privacy is off (`can_read_all_group_messages` from getMe). */
  bot: { id: number; readsAllGroupMessages: boolean };
  now: number;
}

const isAdmin = (status: string) => status === 'administrator' || status === 'creator';

export async function checkAudienceSetup(deps: SetupCheckDeps): Promise<AudienceChat[]> {
  const call = async <T>(run: (signal: AbortSignal) => Promise<unknown>, schema: z.ZodType<T>): Promise<T | null> => {
    try {
      const parsed = schema.safeParse(await run(AbortSignal.timeout(CALL_TIMEOUT_MS)));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  };
  const chats: AudienceChat[] = [];
  for (const target of (await deps.targets.channels()).slice(0, CHANNELS_MAX)) {
    const channel = await call((signal) => deps.telegram.getChat(target.chatId, signal), chatSchema);
    if (channel === null) continue;
    const member = await call(
      (signal) => deps.telegram.getChatMember(String(channel.id), deps.bot.id, signal),
      memberSchema
    );
    const channelAdmin = member !== null && isAdmin(member.status);
    chats.push({
      chatId: channel.id,
      role: 'channel',
      channelChatId: null,
      username: channel.username ?? null,
      title: channel.title ?? target.title,
      botAdmin: channelAdmin,
      seesAll: channelAdmin,
      checkedAt: deps.now
    });
    if (channel.linked_chat_id === undefined) continue;
    const groupId = channel.linked_chat_id;
    const group = await call((signal) => deps.telegram.getChat(String(groupId), signal), chatSchema);
    const groupMember = await call(
      (signal) => deps.telegram.getChatMember(String(groupId), deps.bot.id, signal),
      memberSchema
    );
    const groupAdmin = groupMember !== null && isAdmin(groupMember.status);
    chats.push({
      chatId: groupId,
      role: 'group',
      channelChatId: channel.id,
      username: group?.username ?? null,
      title: group?.title ?? 'Обсуждение',
      botAdmin: groupAdmin,
      seesAll: groupAdmin || deps.bot.readsAllGroupMessages,
      checkedAt: deps.now
    });
  }
  await deps.repo.replaceChats(
    chats,
    chats.map((chat) => chat.chatId)
  );
  return chats;
}
