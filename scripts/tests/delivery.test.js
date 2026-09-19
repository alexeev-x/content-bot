import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deliverUpdates } from '../deliver-updates.js';

test('сбой не подтверждает текущий и следующие апдейты', async () => {
  const seen = [];
  const updates = [1, 2, 3].map((update_id) => ({ update_id }));
  const offset = await deliverUpdates(updates, 0, async ({ update_id }) => {
    seen.push(update_id);
    if (update_id === 2) throw new Error('503 или таймаут');
  });
  assert.equal(offset, 2);
  assert.deepEqual(seen, [1, 2]);
  const recovered = await deliverUpdates(updates.slice(1), offset, async () => {});
  assert.equal(recovered, 4);
});
