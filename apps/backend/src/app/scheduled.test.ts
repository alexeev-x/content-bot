import { describe, expect, it } from 'vitest';
import { createLogger } from '../platform/logging/logger';
import { systemClock } from '../platform/clock';
import { handleScheduled } from './scheduled';

describe('handleScheduled', () => {
  it('logs one structured tick line', async () => {
    const lines: string[] = [];
    const controller = { cron: '* * * * *', scheduledTime: 1_700_000_000_000 } as ScheduledController;

    await handleScheduled(controller, { clock: systemClock, logger: createLogger((line) => lines.push(line)) });

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] as string)).toEqual({
      level: 'info',
      component: 'scheduled',
      operation: 'tick',
      cron: '* * * * *',
      at: 1_700_000_000_000
    });
  });
});
