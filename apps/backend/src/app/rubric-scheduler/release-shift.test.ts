import { describe, expect, it } from 'vitest';
import type { SlotRow } from '../../modules/rubric-scheduler';
import { fromMsk } from '../../shared/msk-time';
import { shiftOrYield } from './release-shift';

// A ready slot the owner's hand-made post has just crowded: it moves behind the post, or yields with its rest unspent.

const DEST = { id: 'dest-main', chatId: '-100' };
const HOUR = 3_600_000;
const DAY = '2026-11-03';
const at = (hour: number, minute = 0) => fromMsk(DAY, hour * 60 + minute);

const slot = (time: number): SlotRow =>
  ({
    id: 'slot-1',
    mskDay: DAY,
    slotAt: time,
    kind: 'pool',
    rubricKey: 'quote',
    status: 'ready',
    buildAt: time - 20 * 60_000,
    weight: 'L',
    interactive: false,
    family: 'quote',
    build: { posts: [{ postId: 'post-1', revision: 1, kind: 'text' }], degradations: [], hasPicture: false }
  }) as unknown as SlotRow;

function harness(direct: number[]) {
  const moves: { to: string; set: Record<string, unknown> }[] = [];
  const container = {
    publicationOutcomes: { outcomes: async () => [], latestForPost: async () => null, recent: async () => [] },
    rubricChannelPosts: { record: async () => undefined, since: async () => direct, purge: async () => 0 },
    rubricSlots: {
      between: async () => [],
      transition: async (input: { to: string; set?: Record<string, unknown> }) => {
        moves.push({ to: input.to, set: input.set ?? {} });
        return true;
      }
    }
  } as unknown as Parameters<typeof shiftOrYield>[0];
  return { container, moves };
}

describe('shiftOrYield', () => {
  it('moves a slot one hour behind his direct post to that post plus two hours, `not_after` following the slot', async () => {
    const { container, moves } = harness([at(11)]);
    const outcome = await shiftOrYield(container, slot(at(12)), DEST, at(11, 59), null);
    expect(outcome).toBe('shifted');
    expect(moves).toHaveLength(1);
    expect(moves[0]?.to).toBe('ready');
    expect(moves[0]?.set.slotAt).toBe(at(11) + 2 * HOUR);
  });

  it('yields when the Moscow day has no room: the slot is superseded, nothing is spent', async () => {
    const { container, moves } = harness([at(21, 30)]);
    const outcome = await shiftOrYield(container, slot(at(22)), DEST, at(21, 59), null);
    expect(outcome).toBe('ownerYield');
    expect(moves[0]?.to).toBe('superseded');
    expect(moves[0]?.set.errorCode).toBe('OWNER_POST');
  });

  it('keeps a slot that his post does not crowd', async () => {
    const { container, moves } = harness([at(8)]);
    expect(await shiftOrYield(container, slot(at(14)), DEST, at(13, 59), null)).toBe('keep');
    expect(moves).toHaveLength(0);
  });
});
