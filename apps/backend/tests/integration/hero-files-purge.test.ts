import { beforeEach, describe, expect, it } from 'vitest';
import { fakeTransport, makeTick, SENT } from '../helpers/dispatch';
import { fakeClock, resetDb, START } from '../helpers/harness';
import { testMediaBucket } from '../helpers/media-bucket';

// The mirrored hero files were removed 24.10.2026 (owner: «с бд удали тоже чтобы место не трогалось»): idle ticks of
// minutes ending in 1 and 6 delete them from R2, and nothing else in the bucket.

beforeEach(resetDb);

describe('the removed hero files', () => {
  it('are deleted from R2 on the minute-1 tick, and the post media beside them stay', async () => {
    const bucket = testMediaBucket();
    for (const key of ['dota/heroes/pudge/icon.png', 'dota/heroes/pudge/render_png.png', 'dota/heroes/axe/icon.png'])
      await bucket.put(key, new Uint8Array([1]));
    await bucket.put('media/keep.png', new Uint8Array([1]));
    const clock = fakeClock();

    await makeTick({ clock, transport: fakeTransport(SENT), scheduledTime: START + 60_000 }).run();

    expect((await bucket.list({ prefix: 'dota/heroes/' })).objects).toHaveLength(0);
    expect(await bucket.head('media/keep.png')).not.toBeNull();
  });
});
