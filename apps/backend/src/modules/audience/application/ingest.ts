import type { Logger } from '../../../platform/logging/logger';
import { type AudienceIntent, commentContent, forwardedPost, routeAudienceUpdate } from '../domain/route-update';
import type { GroupMessage } from '../domain/update-schema';
import type { AudienceRepository } from './ports';

// The webhook's audience branch: a channel post's reaction count, a registered poll's votes, a comment in the
// discussion group. No reply, no Telegram call, at most three D1 round trips. It never throws: the owner's bot must
// answer the webhook whatever happens here.

/** A thread stops taking comments past this many (a flood never fills D1). */
export const THREAD_COMMENTS_MAX = 500;
/** Comments are kept for posts at most this old. */
const THREAD_AGE_MAX_MS = 7 * 86_400_000;

export interface IngestDeps {
  repo: AudienceRepository;
  logger: Logger;
  now: number;
  /** The owner's own comments are not the audience. */
  ownerId: number;
  /** The commenter's keyed hash; null while AUDIENCE_HASH_KEY is not set (comments are then not kept). */
  authorKey: ((userId: number) => Promise<string>) | null;
}

/** Sync and pure: whether the update is the audience's (a reaction count, a poll, a group message). */
export function wantsAudienceUpdate(update: unknown): boolean {
  return routeAudienceUpdate(update) !== null;
}

export async function handleAudienceUpdate(deps: IngestDeps, update: unknown): Promise<void> {
  const intent = routeAudienceUpdate(update);
  if (intent === null) return;
  try {
    await ingest(deps, intent);
  } catch (error) {
    const pending = error instanceof Error && /no such table/i.test(error.message);
    deps.logger.warn({
      component: 'audience',
      operation: intent.kind,
      status: 'failed',
      errorCode: pending ? 'AUDIENCE_MIGRATION_PENDING' : 'AUDIENCE_INGEST_FAILED'
    });
  }
}

async function ingest(deps: IngestDeps, intent: AudienceIntent): Promise<void> {
  switch (intent.kind) {
    case 'reaction':
      return deps.repo.saveReactions({
        chatId: intent.chatId,
        messageId: intent.messageId,
        total: intent.total,
        kindsJson: JSON.stringify(Object.fromEntries(intent.kinds.map((each) => [each.key, each.count]))),
        reportedAt: intent.reportedAt
      });
    case 'poll':
      return deps.repo.savePollState({
        pollId: intent.pollId,
        voters: intent.voters,
        optionsJson: JSON.stringify(intent.options),
        closed: intent.closed,
        now: deps.now
      });
    case 'group_message':
      return groupMessage(deps, intent.message);
  }
}

async function groupMessage(deps: IngestDeps, message: GroupMessage): Promise<void> {
  // Bots, the channel speaking as itself and the owner are not the audience.
  if (message.from === undefined || message.from.is_bot || message.sender_chat !== undefined) {
    const post = forwardedPost(message);
    if (post === null) return;
    // The channel's automatic forward opens the post's thread.
    const chat = await deps.repo.chat(message.chat.id);
    if (chat?.role !== 'group' || chat.channelChatId !== post.channelChatId) return;
    return deps.repo.saveThread({ groupChatId: message.chat.id, rootMessageId: message.message_id, ...post });
  }
  if (message.from.id === deps.ownerId || deps.authorKey === null) return;
  const chat = await deps.repo.chat(message.chat.id);
  if (chat?.role !== 'group') return;

  const rootId = message.message_thread_id ?? message.reply_to_message?.message_id;
  if (rootId === undefined) return;
  let thread = await deps.repo.thread(message.chat.id, rootId);
  // A missed forward update: the reply itself names the forwarded post.
  const replied = message.reply_to_message === undefined ? null : forwardedPost(message.reply_to_message);
  if (thread === null && replied !== null && replied.channelChatId === chat.channelChatId) {
    await deps.repo.saveThread({ groupChatId: message.chat.id, rootMessageId: rootId, ...replied });
    thread = { ...replied, capped: false };
  }
  if (thread === null || thread.capped || deps.now - thread.postAt > THREAD_AGE_MAX_MS) return;

  const content = commentContent(message);
  await deps.repo.saveComment(
    {
      groupChatId: message.chat.id,
      messageId: message.message_id,
      channelChatId: thread.channelChatId,
      channelMessageId: thread.channelMessageId,
      createdAt: message.date * 1000,
      authorKey: await deps.authorKey(message.from.id),
      username: message.from.username ?? null,
      kind: content.kind,
      text: content.text
    },
    THREAD_COMMENTS_MAX
  );
}
