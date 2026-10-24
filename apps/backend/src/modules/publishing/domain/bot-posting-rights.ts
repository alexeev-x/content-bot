import type { DestinationKind } from '@alexeev/contracts';

export type BotMemberStatus = 'creator' | 'administrator' | 'member' | 'restricted' | 'left' | 'kicked';
export type PostingProblem = 'BOT_NOT_MEMBER' | 'BOT_NOT_ADMIN' | 'BOT_CANNOT_POST';

export interface BotMembership {
  status: BotMemberStatus;
  /** Administrators of a channel: the "post messages" right. */
  canPostMessages?: boolean;
  /** Restricted members of a group: the "send messages" permission. */
  canSendMessages?: boolean;
  /** Restricted members can be restricted and gone at once. */
  isMember?: boolean;
}

// Why the bot could not publish into the chat, or null when it can. A channel only accepts posts
// from administrators with the post right; a group accepts any member the chat has not muted.
export function assessBotPosting(input: {
  kind: DestinationKind;
  membership: BotMembership;
  /** The group's default permissions let ordinary members send messages (they say nothing about channels). */
  membersMaySend: boolean;
}): PostingProblem | null {
  const { kind, membership, membersMaySend } = input;
  switch (membership.status) {
    case 'creator':
      return null;
    case 'left':
    case 'kicked':
      return 'BOT_NOT_MEMBER';
    case 'administrator':
      if (kind === 'group') return null;
      return membership.canPostMessages === true ? null : 'BOT_CANNOT_POST';
    case 'member':
      if (kind === 'channel') return 'BOT_NOT_ADMIN';
      return membersMaySend ? null : 'BOT_CANNOT_POST';
    case 'restricted':
      if (kind === 'channel') return 'BOT_NOT_ADMIN';
      if (membership.isMember === false) return 'BOT_NOT_MEMBER';
      return membership.canSendMessages === true ? null : 'BOT_CANNOT_POST';
  }
}
