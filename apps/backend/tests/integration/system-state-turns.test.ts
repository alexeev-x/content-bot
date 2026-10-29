import { describe, expect, it } from 'vitest';
import { createD1SystemState } from '../../src/app/system-state';
import { testDb } from '../helpers/db';

// A rubric's turn counter is one atomic SQL step (json_set … RETURNING in D1): a broken statement would stop the
// tier list from taking turns at all.
describe('nextTurn', () => {
  it('starts at 0 and moves on by one per call, per name', async () => {
    const state = createD1SystemState(testDb());
    expect(await state.nextTurn('tier_list', 1)).toBe(0);
    expect(await state.nextTurn('tier_list', 2)).toBe(1);
    expect(await state.nextTurn('tier_list', 3)).toBe(2);
    expect(await state.nextTurn('other', 4)).toBe(0);
  });
});
