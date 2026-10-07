import type { PublicationDto } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeOwnerMessenger } from '../../../tests/helpers/fake-owner-messenger';
import type { LogEvent, Logger } from '../../platform/logging/logger';
import { createScheduleNotifier, type ScheduleNotifierDeps } from './create-schedule-notifier';

const publication: PublicationDto = {
  id: '5d4f8a7e-3b6c-4e2a-9f10-1a2b3c4d5e6f',
  postId: '7e6d5c4b-3a29-4180-8f7e-6d5c4b3a2918',
  postRevision: 1,
  destinationId: '1b2c3d4e-5f60-4718-8293-a4b5c6d7e8f9',
  status: 'scheduled',
  scheduledAt: '2026-10-17T11:30:00.000Z',
  timezone: 'Europe/Moscow',
  revision: 0,
  createdAt: '2026-10-17T10:00:00.000Z',
  updatedAt: '2026-10-17T10:00:00.000Z'
};
const SECRET_BODY = 'secret post text';
const TOKEN = '123456:TEST-BOT-TOKEN-PLACEHOLDER';

let events: LogEvent[];
let background: Promise<unknown>[];
const logger: Logger = {
  info: (event) => events.push(event),
  warn: (event) => events.push(event),
  error: (event) => events.push(event)
};

beforeEach(() => {
  events = [];
  background = [];
});

function deps(overrides: Partial<ScheduleNotifierDeps>): ScheduleNotifierDeps {
  return {
    messenger: fakeOwnerMessenger(),
    ownerChatId: '4242',
    appOrigin: 'https://studio.example.dev',
    posts: () => ({ findRevision: () => Promise.resolve({ title: 'Patch', body: SECRET_BODY }) }),
    destinations: () => ({ findById: () => Promise.resolve(null) }),
    logger,
    requestId: 'req-1',
    waitUntil: (work) => background.push(work),
    ...overrides
  };
}

const settle = () => Promise.all(background);

describe('createScheduleNotifier', () => {
  it('sends one message to the owner chat in the background', async () => {
    const messenger = fakeOwnerMessenger();
    createScheduleNotifier(deps({ messenger })).scheduled(publication);

    expect(background).toHaveLength(1);
    await settle();

    expect(messenger.sent).toHaveLength(1);
    expect(messenger.sent[0]).toMatchObject({ chatId: '4242', button: { text: 'Подробнее' } });
    expect(events.at(-1)).toMatchObject({ component: 'owner_notice', status: 'sent', requestId: 'req-1' });
  });

  it('skips with a log line when the bot has no token', async () => {
    createScheduleNotifier(deps({ messenger: null })).scheduled(publication);
    await settle();

    expect(events).toEqual([
      {
        component: 'owner_notice',
        operation: 'schedule_notice.scheduled',
        requestId: 'req-1',
        status: 'skipped',
        errorCode: 'BOT_TOKEN_MISSING'
      }
    ]);
  });

  it('swallows a Telegram failure into one stable log code without leaking text or token', async () => {
    const messenger = fakeOwnerMessenger({ fail: () => new Error(`boom ${TOKEN} ${SECRET_BODY}`) });
    createScheduleNotifier(deps({ messenger })).rescheduled(publication);

    await expect(settle()).resolves.toBeDefined();

    const failed = events.find((event) => event.status === 'failed');
    expect(failed).toMatchObject({ operation: 'schedule_notice.rescheduled', errorCode: 'UNAVAILABLE' });
    const logged = JSON.stringify(events);
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain(SECRET_BODY);
  });

  it('swallows a failing read the same way and sends nothing', async () => {
    const messenger = fakeOwnerMessenger();
    const posts = () => ({ findRevision: () => Promise.reject(new Error(SECRET_BODY)) });
    createScheduleNotifier(deps({ messenger, posts })).scheduled(publication);

    await settle();

    expect(messenger.sent).toEqual([]);
    expect(events.at(-1)).toMatchObject({ status: 'failed', errorCode: 'UNEXPECTED_ERROR' });
    expect(JSON.stringify(events)).not.toContain(SECRET_BODY);
  });

  it('gives up on a Telegram that never answers', async () => {
    const messenger = fakeOwnerMessenger({ hang: true });
    createScheduleNotifier(deps({ messenger, timeoutMs: 20 })).scheduled(publication);

    await settle();

    expect(events.at(-1)).toMatchObject({ status: 'failed', errorCode: 'UNAVAILABLE' });
  });

  it('does not throw when there is no execution context', () => {
    const notifier = createScheduleNotifier(
      deps({
        waitUntil: () => {
          throw new Error('no ExecutionContext');
        }
      })
    );

    expect(() => notifier.scheduled(publication)).not.toThrow();
    expect(events.some((event) => event.errorCode === 'NO_EXECUTION_CONTEXT')).toBe(true);
  });
});
