import {
  COUNTING_STATUSES,
  type ChannelPost,
  type Pace,
  scheduleOf,
  shiftedAt,
  type SlotRow
} from '../../modules/rubric-scheduler';
import type { Container } from '../container';
import { rubricDescriptors } from '../rubric-catalog';
import { channelPosts } from './channel-posts';

const DAY_MS = 86_400_000;
const LOOKBACK_MS = 7 * DAY_MS;
const AHEAD_MS = 3 * DAY_MS;
const OCCUPYING = new Set<string>([...COUNTING_STATUSES, 'building', 'ready', 'released', 'waiting_parent', 'unknown']);

export type ShiftOutcome = 'keep' | 'shifted' | 'ownerYield' | 'lost';

/**
 * A ready slot whose time falls within the gap after one of the owner's own posts (owner, 31.10.2026) moves to that post
 * plus the gap, on the same Moscow day and still inside every rule; with no room the slot yields and its posts go. The
 * built post is kept. Every move is one conditional transition, so overlapping ticks cannot move or yield it twice.
 */
export async function shiftOrYield(
  container: Pick<Container, 'publicationOutcomes' | 'rubricSlots' | 'rubricChannelPosts'>,
  slot: SlotRow,
  destination: { id: string; chatId: string },
  now: number,
  pace: Pace | null
): Promise<ShiftOutcome> {
  const recent = await container.rubricSlots.between(now - LOOKBACK_MS, now + AHEAD_MS);
  const ours = new Set(recent.flatMap((row) => (row.build?.posts ?? []).map((post) => post.postId)));
  const channel = await channelPosts(container, destination, ours, now, now - LOOKBACK_MS);
  const context = {
    rubrics: new Map(rubricDescriptors().map((rubric) => [rubric.key, rubric])),
    anchor: slot.kind === 'anchor',
    ...(pace === null ? {} : { pace })
  };
  const occupants: ChannelPost[] = [
    ...channel,
    ...recent
      .filter((row) => row.id !== slot.id && row.kind !== 'poll_close' && OCCUPYING.has(row.status))
      .map((row) => ({
        at: row.slotAt,
        weight: row.weight,
        rubric: row.rubricKey,
        interactive: row.interactive,
        family: row.family
      }))
  ];
  const at = shiftedAt(
    {
      at: slot.slotAt,
      weight: slot.weight,
      rubric: slot.rubricKey,
      interactive: slot.interactive,
      family: slot.family
    },
    occupants,
    context
  );
  if (at === slot.slotAt) return 'keep';
  if (at === null) {
    return (await container.rubricSlots.transition({
      id: slot.id,
      from: 'ready',
      to: 'superseded',
      now,
      set: { errorCode: 'OWNER_POST', errorStep: 'release', leaseUntil: null }
    }))
      ? 'ownerYield'
      : 'lost';
  }
  const times = scheduleOf('ready', { slotAt: at, buildAt: slot.buildAt }, now);
  return (await container.rubricSlots.transition({
    id: slot.id,
    from: 'ready',
    to: 'ready',
    now,
    set: { slotAt: at, nextActionAt: times.nextActionAt, deadlineAt: times.deadlineAt }
  }))
    ? 'shifted'
    : 'lost';
}
