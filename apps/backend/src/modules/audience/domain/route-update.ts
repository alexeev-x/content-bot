import { sanitizeComment } from './sanitize';
import {
  groupMessageUpdateSchema,
  pollUpdateSchema,
  reactionCountUpdateSchema,
  type GroupMessage
} from './update-schema';

// What an incoming update is to the audience branch. Pure: the same update always gives the same intent, so a replay
// writes the same idempotent row.

/** At most this many reaction kinds are kept per post, the most given first. */
export const REACTION_KINDS_MAX = 40;

export type AudienceIntent =
  | {
      kind: 'reaction';
      chatId: number;
      messageId: number;
      total: number;
      kinds: { key: string; count: number }[];
      reportedAt: number;
    }
  | {
      kind: 'poll';
      pollId: string;
      voters: number;
      closed: boolean;
      options: { text: string; voters: number }[];
    }
  | { kind: 'group_message'; message: GroupMessage };

export function routeAudienceUpdate(update: unknown): AudienceIntent | null {
  const reaction = reactionCountUpdateSchema.safeParse(update);
  if (reaction.success) {
    const { chat, message_id, date, reactions } = reaction.data.message_reaction_count;
    const kinds = reactions
      .map((each) => ({
        key: each.type.emoji ?? each.type.custom_emoji_id ?? each.type.type,
        count: each.total_count
      }))
      .sort((a, b) => b.count - a.count);
    return {
      kind: 'reaction',
      chatId: chat.id,
      messageId: message_id,
      // Emoji, custom and paid reactions alike.
      total: reactions.reduce((sum, each) => sum + each.total_count, 0),
      kinds: kinds.slice(0, REACTION_KINDS_MAX),
      reportedAt: date * 1000
    };
  }
  const poll = pollUpdateSchema.safeParse(update);
  if (poll.success) {
    const { id, total_voter_count, is_closed, options } = poll.data.poll;
    return {
      kind: 'poll',
      pollId: id,
      voters: total_voter_count,
      closed: is_closed,
      options: options.map((option) => ({ text: option.text, voters: option.voter_count }))
    };
  }
  const message = groupMessageUpdateSchema.safeParse(update);
  if (message.success) return { kind: 'group_message', message: message.data.message };
  return null;
}

/** The channel post an automatic forward stands for, or null when the message is not one. */
export function forwardedPost(
  message: Pick<GroupMessage, 'is_automatic_forward' | 'forward_origin'>
): { channelChatId: number; channelMessageId: number; postAt: number } | null {
  const origin = message.forward_origin;
  if (message.is_automatic_forward !== true || origin?.type !== 'channel') return null;
  if (origin.chat === undefined || origin.message_id === undefined) return null;
  return { channelChatId: origin.chat.id, channelMessageId: origin.message_id, postAt: origin.date * 1000 };
}

/** What of a comment is kept: its kind and sanitised text (a caption counts as text). */
export function commentContent(message: GroupMessage): { kind: 'text' | 'media'; text: string | null } {
  const media =
    message.photo !== undefined ||
    message.video !== undefined ||
    message.animation !== undefined ||
    message.sticker !== undefined ||
    message.voice !== undefined ||
    message.video_note !== undefined ||
    message.document !== undefined;
  const raw = message.text ?? message.caption;
  return { kind: media ? 'media' : 'text', text: raw === undefined ? null : sanitizeComment(raw) };
}
