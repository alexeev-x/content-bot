import type { TelegramBotAdminApi, TelegramChatReadApi } from '../../src/integrations/telegram/telegram-api';
import { createApp } from '../../src/app/create-app';
import type { AppEnv } from '../../src/app/env';
import type { Clock } from '../../src/platform/clock';
import { sha256Hex } from '../../src/platform/security/sha256';
import { testDb } from './db';

export const OWNER_ID = '4242';
export const OWNER_TOKEN = 'owner-token-0000000000000000000000000000000';
export const START = 1_800_000_000_000;

export interface FakeClock extends Clock {
  set(value: number): void;
  advance(ms: number): void;
}

export function fakeClock(start = START): FakeClock {
  let current = start;
  return {
    now: () => current,
    set: (value) => {
      current = value;
    },
    advance: (ms) => {
      current += ms;
    }
  };
}

export async function resetDb(): Promise<void> {
  const db = testDb();
  // Children first: jobs reference publications, which reference posts, revisions and destinations.
  await db.batch(
    [
      'incidents',
      'job_attempts',
      'jobs',
      'publications',
      'destinations',
      'post_revisions',
      'audit_log',
      'settings',
      'bot_identity',
      'idempotency_keys',
      'posts',
      'rate_limits',
      'widget_sign_ins',
      'refresh_tokens',
      'sessions'
    ].map((table) => db.prepare(`DELETE FROM ${table}`))
  );
}

export async function seedBotIdentity(info: unknown, botId = 123456): Promise<void> {
  await testDb()
    .prepare('INSERT INTO bot_identity (id, bot_id, info, updated_at) VALUES (1, ?1, ?2, ?3)')
    .bind(botId, JSON.stringify(info), START)
    .run();
}

export async function readBotIdentityRow(): Promise<{ bot_id: number; info: string; updated_at: number } | null> {
  return testDb().prepare('SELECT bot_id, info, updated_at FROM bot_identity WHERE id = 1').first();
}

export async function seedSession(options: {
  token: string;
  telegramId?: string;
  kind?: 'browser' | 'miniapp';
  createdAt?: number;
  expiresAt?: number;
  revokedAt?: number | null;
}): Promise<void> {
  const createdAt = options.createdAt ?? START;
  await testDb()
    .prepare(
      `INSERT INTO sessions (id, token_hash, telegram_id, kind, expires_at, created_at, revoked_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
    )
    .bind(
      crypto.randomUUID(),
      await sha256Hex(options.token),
      options.telegramId ?? OWNER_ID,
      options.kind ?? 'browser',
      options.expiresAt ?? createdAt + 60 * 60 * 1000,
      createdAt,
      options.revokedAt ?? null
    )
    .run();
}

export interface Api {
  clock: FakeClock;
  /** Work the app handed to `ctx.waitUntil`, i.e. what runs after a response was sent. */
  background: Promise<unknown>[];
  request(path: string, init?: RequestInit & { token?: string | null; json?: unknown }): Promise<Response>;
}

// A new app per test with an injected clock, running against the real migrated D1.
export const TEST_BOT_TOKEN = '123456:TEST-BOT-TOKEN-PLACEHOLDER';

export function createApi(
  options: {
    ownerTelegramId?: string;
    clock?: FakeClock;
    botToken?: string | null;
    publishingEnabled?: string;
    chatApi?: TelegramChatReadApi;
    botAdminApi?: TelegramBotAdminApi;
    webhookSecret?: string;
    botInfo?: string;
  } = {}
): Api {
  const clock = options.clock ?? fakeClock();
  const app = createApp({ clock, telegramChatApi: options.chatApi, telegramBotAdminApi: options.botAdminApi });
  const env = {
    DB: testDb(),
    OWNER_TELEGRAM_ID: options.ownerTelegramId ?? OWNER_ID,
    ...(options.publishingEnabled === undefined ? {} : { PUBLISHING_ENABLED: options.publishingEnabled }),
    ...(options.botInfo === undefined ? {} : { BOT_INFO: options.botInfo }),
    ...(options.webhookSecret === undefined ? {} : { TELEGRAM_WEBHOOK_SECRET: options.webhookSecret }),
    ...(options.botToken === null ? {} : { TELEGRAM_BOT_TOKEN: options.botToken ?? TEST_BOT_TOKEN })
  } as AppEnv;
  const background: Promise<unknown>[] = [];
  const executionCtx = {
    waitUntil: (work: Promise<unknown>) => {
      background.push(work);
    },
    passThroughOnException: () => {}
  };
  return {
    clock,
    background,
    request(path, init = {}) {
      const { token = OWNER_TOKEN, json, headers, ...rest } = init;
      const merged = new Headers(headers);
      if (token !== null) merged.set('authorization', `Bearer ${token}`);
      if (json !== undefined) merged.set('content-type', 'application/json');
      return Promise.resolve(
        app.request(
          path,
          { ...rest, headers: merged, body: json === undefined ? rest.body : JSON.stringify(json) },
          env,
          executionCtx as never
        )
      );
    }
  };
}
