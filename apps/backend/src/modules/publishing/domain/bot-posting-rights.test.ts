import { describe, expect, it } from 'vitest';
import { assessBotPosting, type BotMembership, type PostingProblem } from './bot-posting-rights';

const assess = (kind: 'channel' | 'group', membership: BotMembership, membersMaySend = true) =>
  assessBotPosting({ kind, membership, membersMaySend });

describe('assessBotPosting', () => {
  it.each<[string, 'channel' | 'group', BotMembership, boolean, PostingProblem | null]>([
    ['channel creator', 'channel', { status: 'creator' }, true, null],
    ['channel admin with the post right', 'channel', { status: 'administrator', canPostMessages: true }, true, null],
    ['channel admin without the post right', 'channel', { status: 'administrator' }, true, 'BOT_CANNOT_POST'],
    [
      'channel admin with the post right off',
      'channel',
      { status: 'administrator', canPostMessages: false },
      true,
      'BOT_CANNOT_POST'
    ],
    ['channel member', 'channel', { status: 'member' }, true, 'BOT_NOT_ADMIN'],
    ['channel left', 'channel', { status: 'left' }, true, 'BOT_NOT_MEMBER'],
    ['channel kicked', 'channel', { status: 'kicked' }, true, 'BOT_NOT_MEMBER'],
    ['group admin (no channel rights apply)', 'group', { status: 'administrator' }, true, null],
    ['group member', 'group', { status: 'member' }, true, null],
    ['group member when members are muted by default', 'group', { status: 'member' }, false, 'BOT_CANNOT_POST'],
    [
      'group restricted from sending',
      'group',
      { status: 'restricted', canSendMessages: false },
      true,
      'BOT_CANNOT_POST'
    ],
    ['group restricted but allowed to send', 'group', { status: 'restricted', canSendMessages: true }, false, null],
    [
      'group restricted and gone',
      'group',
      { status: 'restricted', canSendMessages: true, isMember: false },
      true,
      'BOT_NOT_MEMBER'
    ],
    ['group left', 'group', { status: 'left' }, true, 'BOT_NOT_MEMBER'],
    ['group kicked', 'group', { status: 'kicked' }, true, 'BOT_NOT_MEMBER']
  ])('%s', (_name, kind, membership, membersMaySend, expected) => {
    expect(assess(kind, membership, membersMaySend)).toBe(expected);
  });
});
