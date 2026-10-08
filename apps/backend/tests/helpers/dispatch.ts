import type { PostEntity } from '@alexeev/contracts';
import { GrammyError, HttpError } from 'grammy';
import { createContainer, type Container } from '../../src/app/container';
import { handleScheduled } from '../../src/app/scheduled';
import type { PublicationTransport, SendOutcome } from '../../src/modules/publishing';
import { createTelegramPublicationTransport, type TelegramSender } from '../../src/modules/publishing';
import { createLogger } from '../../src/platform/logging/logger';
import { testDb } from './db';
import { fakeBotAdminApi } from './fake-bot-admin-api';
import { fakeChatApi } from './fake-chat-api';
import { fakeOwnerMessenger, type FakeOwnerMessenger } from './fake-owner-messenger';
import { type Api, type FakeClock, OWNER_ID, START } from './harness';
import { seedApprovedPost, seedDestination, seedPublication } from './publishing';

// START is minute 0 of an hour (the cleanup tick); this one is not.
export const MINUTE_TICK = START + 7 * 60_000;
export const HOURLY_TICK = START;

export interface SentCall {
  chatId: string;
  text: string;
  entities: PostEntity[];
}

// A scripted transport: answers come off the queue (the last one repeats). Records every send.
export interface FakeTransport extends PublicationTransport {
  calls: SentCall[];
}

export function fakeTransport(...script: SendOutcome[]): FakeTransport {
  const calls: SentCall[] = [];
  let index = 0;
  return {
    calls,
    send(input) {
      calls.push({ chatId: input.chatId, text: input.text, entities: input.entities });
      const next = script[Math.min(index, script.length - 1)] ?? { kind: 'sent', externalMessageId: '1' };
      index += 1;
      return Promise.resolve(next);
    }
  };
}

export const SENT: SendOutcome = { kind: 'sent', externalMessageId: '4242' };

export function grammyError(code: number, description: string, parameters: Record<string, number> = {}): GrammyError {
  return new GrammyError(description, { ok: false, error_code: code, description, parameters }, 'sendMessage', {
    chat_id: '-100'
  });
}

export { HttpError };

// The real adapter over a scripted grammY-level sender: proves the mapping from Telegram's
// answers to job states end to end. `step` returns a message, throws, or never settles.
export type SenderStep = () => Promise<unknown>;

export interface FakeSender extends TelegramSender {
  requests: { chatId: string; text: string; other: unknown }[];
}

export function fakeSender(step: SenderStep): FakeSender {
  const requests: FakeSender['requests'] = [];
  return {
    requests,
    sendMessage(chatId, text, other, signal) {
      requests.push({ chatId, text, other });
      return Promise.race([
        step(),
        new Promise<never>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason as Error), { once: true });
        })
      ]);
    }
  };
}

export function adapterTransport(
  step: SenderStep,
  timeoutMs = 50
): { transport: PublicationTransport; sender: FakeSender } {
  const sender = fakeSender(step);
  return { transport: createTelegramPublicationTransport(sender, timeoutMs), sender };
}

export interface TickOptions {
  clock: FakeClock;
  transport: PublicationTransport;
  publishing?: string;
  token?: string | null;
  scheduledTime?: number;
  db?: D1Database;
  random?: () => number;
  /** Wraps the real container, for racing, metering or failing a part of it. */
  tweak?: (container: Container) => Container;
  /** Replaces the recording fake that stands for the owner's chat. Without a token the container has none. */
  ownerMessenger?: FakeOwnerMessenger;
}

export interface Tick {
  /** What reached the owner's chat. */
  ownerMessages: FakeOwnerMessenger['sent'];
  container: Container;
  logs: Record<string, unknown>[];
  run(): Promise<void>;
}

export function makeTick(options: TickOptions): Tick {
  const logs: Record<string, unknown>[] = [];
  const messenger = options.ownerMessenger ?? fakeOwnerMessenger();
  const base = createContainer(
    {
      DB: options.db ?? testDb(),
      OWNER_TELEGRAM_ID: OWNER_ID,
      PUBLISHING_ENABLED: options.publishing ?? 'true',
      ...(options.token === null ? {} : { TELEGRAM_BOT_TOKEN: options.token ?? '123456:TEST-BOT-TOKEN-PLACEHOLDER' })
    },
    {
      clock: options.clock,
      transport: options.transport,
      random: options.random ?? (() => 0),
      // Most Cron tests exercise publishing only. Dota watcher tests opt in to its real D1 behavior.
      dotaWatcher: {
        sync: async () => ({ inserted: 0, fetched: 0 }),
        summarizePatch: async () => null
      },
      // Without a token the real Telegram clients refuse to be built; spreading the container below
      // reads every getter, so the ones a tick never uses are replaced by inert fakes.
      ...(options.token === null
        ? { telegramChatApi: fakeChatApi({ chat: {} }), telegramBotAdminApi: fakeBotAdminApi() }
        : { ownerMessenger: messenger })
    }
  );
  // Spreading reads every getter once: all of them are resolvable in tests.
  const logger = createLogger((line) => logs.push(JSON.parse(line) as Record<string, unknown>));
  const container = (options.tweak ?? ((value) => value))({ ...base, logger });
  const controller = {
    cron: '* * * * *',
    scheduledTime: options.scheduledTime ?? MINUTE_TICK
  } as ScheduledController;
  return { container, logs, ownerMessages: messenger.sent, run: () => handleScheduled(controller, container) };
}

/** One counter of the tick's summary log line (0 when the tick did not report it). */
export function tickCount(tick: Tick, name: string): number {
  const line = tick.logs.find((entry) => entry.operation === 'tick');
  if (line === undefined) throw new Error('No tick log line');
  return (line.counts as Record<string, number>)[name] ?? 0;
}

export const isoAt = (now: number) => new Date(now).toISOString();

// An approved post scheduled "now": its job is due at once.
export async function seedDueJob(
  api: Api,
  input: { title?: string; chatId?: string } = {}
): Promise<{ publicationId: string; jobId: string; chatId: string; destinationId: string; postId: string }> {
  const post = await seedApprovedPost(api, input.title);
  const chatId = input.chatId ?? `-100${Math.floor(Math.random() * 1e9)}`;
  const destination = await seedDestination(api, { chatId });
  const publication = await seedPublication(api, {
    postId: post.id,
    revision: post.revision,
    destinationId: destination.id,
    scheduledAt: isoAt(api.clock.now())
  });
  const job = await testDb()
    .prepare('SELECT id FROM jobs WHERE publication_id = ?1')
    .bind(publication.id)
    .first<{ id: string }>();
  if (job === null) throw new Error('job missing');
  return { publicationId: publication.id, jobId: job.id, chatId, destinationId: destination.id, postId: post.id };
}

export interface AttemptRow {
  attempt: number;
  outcome: string;
  error_code: string | null;
  retry_after: number | null;
  external_message_id: string | null;
  started_at: number;
  finished_at: number;
}

export async function attemptsOf(jobId: string): Promise<AttemptRow[]> {
  const { results } = await testDb()
    .prepare(
      `SELECT attempt, outcome, error_code, retry_after, external_message_id, started_at, finished_at
       FROM job_attempts WHERE job_id = ?1 ORDER BY attempt`
    )
    .bind(jobId)
    .all<AttemptRow>();
  return results;
}

export interface IncidentRow {
  kind: string;
  code: string;
  publication_id: string | null;
  job_id: string | null;
  resolved_at: number | null;
  details: string | null;
}

export async function incidentsOf(jobId: string): Promise<IncidentRow[]> {
  const { results } = await testDb()
    .prepare('SELECT kind, code, publication_id, job_id, resolved_at, details FROM incidents WHERE job_id = ?1')
    .bind(jobId)
    .all<IncidentRow>();
  return results;
}

export async function publicationOf(
  id: string
): Promise<{ external_message_id: string | null; last_error_code: string | null }> {
  const row = await testDb()
    .prepare('SELECT external_message_id, last_error_code FROM publications WHERE id = ?1')
    .bind(id)
    .first<{ external_message_id: string | null; last_error_code: string | null }>();
  if (row === null) throw new Error('publication missing');
  return row;
}
