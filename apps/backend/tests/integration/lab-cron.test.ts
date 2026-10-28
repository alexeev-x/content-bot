import { beforeEach, expect, it } from 'vitest';
import { labCron } from '../../src/app/lab/lab-cron';
import { handleScheduled } from '../../src/app/scheduled';
import { testDb } from '../helpers/db';
import { fakeTransport, makeTick, MINUTE_TICK, SENT } from '../helpers/dispatch';
import { fakeClock, resetDb } from '../helpers/harness';

// DEV's Cron (owner, 28.10.2026: «дев максимально отключить кроны… к базе»): with the master switch off a tick only
// reads the switch, so DEV writes nothing to D1 on its own; production (no lab) runs as before.

const stateRows = async () =>
  (await testDb().prepare('SELECT COUNT(*) AS n FROM system_state').first<{ n: number }>())?.n ?? 0;
const runs = async () =>
  (await testDb().prepare('SELECT COUNT(*) AS n FROM automation_runs').first<{ n: number }>())?.n ?? 0;

beforeEach(async () => {
  await resetDb();
});

it('writes nothing on DEV while the master switch is off, and runs as production without the lab', async () => {
  const clock = fakeClock(MINUTE_TICK);
  const tick = makeTick({ clock, transport: fakeTransport(SENT) });
  const controller = { cron: '* * * * *', scheduledTime: MINUTE_TICK } as ScheduledController;
  const before = { state: await stateRows(), runs: await runs() };
  await handleScheduled(controller, tick.container, labCron);
  expect({ state: await stateRows(), runs: await runs() }).toEqual(before);
  expect(tick.logs.some((entry) => entry.status === 'lab_off')).toBe(true);
  await tick.run();
  expect(await stateRows()).toBeGreaterThan(before.state);
});
