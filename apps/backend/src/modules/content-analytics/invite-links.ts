import type { InviteLinkDto, InviteLinksDto } from '@alexeev/contracts';
import type { Clock } from '../../platform/clock';
import { AppError } from '../../shared/app-error';

// Invite links into the analytics Telegram channel, one per traffic source, and the joins through them
// (plan B1, owner 20.10.2026). The bot creates the links; Telegram's chat_member updates say who joined through
// which one and who left.

const DAY_MS = 24 * 60 * 60 * 1000;
const TELEGRAM_USERNAME = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;
/** A reservation older than this whose Telegram call never finished (the Worker was cut off) frees its name. */
export const STALE_RESERVATION_MS = 60_000;

export interface InviteLinkRow {
  id: string;
  name: string;
  url: string;
  createdAt: number;
  revokedAt: number | null;
}

export interface InviteCountsRow {
  /** null: joins without a studio link. */
  linkId: string | null;
  joined: number;
  left: number;
}

export interface InviteLinkRepository {
  read(since: number): Promise<{ links: InviteLinkRow[]; counts: InviteCountsRow[]; trackingSince: number | null }>;
  find(id: string): Promise<InviteLinkRow | null>;
  /** Holds the name before Telegram is asked: `taken` when an active link has it, `full` at INVITE_LINKS_MAX active. */
  reserve(input: { id: string; name: string; now: number }): Promise<'reserved' | 'taken' | 'full'>;
  complete(id: string, url: string): Promise<void>;
  release(id: string): Promise<void>;
  revoke(id: string, now: number): Promise<void>;
  /** A join of the channel; `inviteUrl` is matched to a studio link, an unknown or missing one counts as no link. */
  recordJoin(input: { id: string; userId: number; inviteUrl: string | null; at: number }): Promise<void>;
  recordLeave(input: { userId: number; at: number }): Promise<void>;
}

/** What the Telegram adapter reports; it never throws for a refusal it can explain. */
export type InviteCallResult<T> =
  | { ok: true; value: T }
  /** The bot is not an admin of the channel, lacks the right to invite, or the channel is wrong. */
  | { ok: false; reason: 'forbidden' };

export interface InviteLinkTelegram {
  /** Throws an AppError (UNAVAILABLE or RATE_LIMIT) when Telegram is down or asks to wait. */
  create(channel: string, name: string): Promise<InviteCallResult<string>>;
  revoke(channel: string, url: string): Promise<InviteCallResult<void>>;
}

export interface InviteLinkDeps {
  repo: InviteLinkRepository;
  clock: Clock;
  /** `ANALYTICS_TELEGRAM_CHANNEL`; the links lead there. */
  channel: string | undefined;
}

/** The channel username without «@», or null when it is not a valid one. */
export function inviteChannelOf(channel: string | undefined): string | null {
  const name = channel?.trim().replace(/^@/, '') ?? '';
  return TELEGRAM_USERNAME.test(name) ? name : null;
}

const iso = (at: number) => new Date(at).toISOString();

function toDto(link: InviteLinkRow, counts: InviteCountsRow | undefined): InviteLinkDto {
  return {
    id: link.id,
    name: link.name,
    url: link.url,
    createdAt: iso(link.createdAt),
    revokedAt: link.revokedAt === null ? null : iso(link.revokedAt),
    joined: counts?.joined ?? 0,
    left: counts?.left ?? 0
  };
}

export async function readInviteLinks(deps: InviteLinkDeps, days: number): Promise<InviteLinksDto> {
  const { links, counts, trackingSince } = await deps.repo.read(deps.clock.now() - days * DAY_MS);
  const byLink = new Map(counts.map((row) => [row.linkId, row]));
  const without = byLink.get(null);
  return {
    channel: inviteChannelOf(deps.channel),
    links: links.map((link) => toDto(link, byLink.get(link.id))),
    withoutLink: { joined: without?.joined ?? 0, left: without?.left ?? 0 },
    trackingSince: trackingSince === null ? null : iso(trackingSince)
  };
}

function cannotInvite(): AppError {
  return new AppError('UNAVAILABLE', 'The bot cannot manage invite links of the channel', {
    reason: 'BOT_CANNOT_INVITE'
  });
}

function requireChannel(channel: string | undefined): string {
  const name = inviteChannelOf(channel);
  if (name === null) {
    throw new AppError('UNAVAILABLE', 'The analytics Telegram channel is not set', {
      reason: 'CHANNEL_NOT_CONFIGURED'
    });
  }
  return name;
}

export async function createInviteLink(
  deps: InviteLinkDeps & { telegram: () => InviteLinkTelegram; newId: () => string },
  name: string
): Promise<InviteLinkDto> {
  const channel = requireChannel(deps.channel);
  // Built before the reservation: a missing bot token is a 503 that must not hold the name.
  const telegram = deps.telegram();
  const id = deps.newId();
  const now = deps.clock.now();
  const reserved = await deps.repo.reserve({ id, name, now });
  if (reserved === 'taken') {
    throw new AppError('VALIDATION_ERROR', 'An active invite link already has this name', { reason: 'NAME_TAKEN' });
  }
  if (reserved === 'full') {
    throw new AppError('VALIDATION_ERROR', 'Too many active invite links', { reason: 'TOO_MANY_LINKS' });
  }
  // A timeout or 5xx may still have created the link in Telegram: the reservation is kept (it lapses after
  // STALE_RESERVATION_MS), so an immediate retry is NAME_TAKEN instead of a second, untracked link.
  const result = await telegram.create(`@${channel}`, name);
  if (!result.ok) {
    await deps.repo.release(id);
    throw cannotInvite();
  }
  await deps.repo.complete(id, result.value);
  return toDto({ id, name, url: result.value, createdAt: now, revokedAt: null }, undefined);
}

/** Stops the link in Telegram, then marks it; its joins stay. Safe to repeat. */
export async function revokeInviteLink(
  deps: InviteLinkDeps & { telegram: () => InviteLinkTelegram },
  id: string
): Promise<InviteLinkDto> {
  const link = await deps.repo.find(id);
  if (link === null) throw new AppError('NOT_FOUND', 'Invite link not found');
  if (link.revokedAt !== null) return toDto(link, undefined);
  const result = await deps.telegram().revoke(`@${requireChannel(deps.channel)}`, link.url);
  if (!result.ok) throw cannotInvite();
  const now = deps.clock.now();
  await deps.repo.revoke(id, now);
  return toDto({ ...link, revokedAt: now }, undefined);
}

// ---- chat_member updates ----

export type MemberStatus = { status: string; is_member?: boolean };

/** In the channel: a subscriber, an admin or the owner (a restricted one only while still a member). */
function isInside(member: MemberStatus): boolean {
  if (member.status === 'restricted') return member.is_member === true;
  return member.status === 'creator' || member.status === 'administrator' || member.status === 'member';
}

export type MemberChange = 'join' | 'leave' | null;

export function memberChange(oldMember: MemberStatus, newMember: MemberStatus): MemberChange {
  const before = isInside(oldMember);
  const after = isInside(newMember);
  if (!before && after) return 'join';
  if (before && !after) return 'leave';
  return null;
}

export interface ChannelMemberUpdate {
  /** The channel's @username from the update; joins of any other chat are ignored. */
  chatUsername: string | undefined;
  userId: number;
  isBot: boolean;
  change: MemberChange;
  inviteUrl: string | null;
  /** Telegram's time of the change, epoch ms. */
  at: number;
}

/** Records a join or a leave of the analytics channel. Returns what was recorded, for the log. */
export async function recordChannelMember(
  deps: { repo: InviteLinkRepository; channel: string | undefined; newId: () => string },
  update: ChannelMemberUpdate
): Promise<'join' | 'leave' | 'ignored'> {
  const channel = inviteChannelOf(deps.channel);
  if (
    channel === null ||
    update.chatUsername?.toLowerCase() !== channel.toLowerCase() ||
    update.isBot ||
    update.change === null
  ) {
    return 'ignored';
  }
  if (update.change === 'join') {
    await deps.repo.recordJoin({ id: deps.newId(), userId: update.userId, inviteUrl: update.inviteUrl, at: update.at });
    return 'join';
  }
  await deps.repo.recordLeave({ userId: update.userId, at: update.at });
  return 'leave';
}
