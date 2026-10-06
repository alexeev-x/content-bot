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
      'jobs',
      'publications',
      'destinations',
      'post_revisions',
      'audit_log',
      'idempotency_keys',
      'posts',
      'sessions'
    ].map((table) => db.prepare(`DELETE FROM ${table}`))
  );
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
  request(path: string, init?: RequestInit & { token?: string | null; json?: unknown }): Promise<Response>;
}

// A new app per test with an injected clock, running against the real migrated D1.
export function createApi(options: { ownerTelegramId?: string; clock?: FakeClock } = {}): Api {
  const clock = options.clock ?? fakeClock();
  const app = createApp({ clock });
  const env = { DB: testDb(), OWNER_TELEGRAM_ID: options.ownerTelegramId ?? OWNER_ID } as AppEnv;
  return {
    clock,
    request(path, init = {}) {
      const { token = OWNER_TOKEN, json, headers, ...rest } = init;
      const merged = new Headers(headers);
      if (token !== null) merged.set('authorization', `Bearer ${token}`);
      if (json !== undefined) merged.set('content-type', 'application/json');
      return Promise.resolve(
        app.request(
          path,
          { ...rest, headers: merged, body: json === undefined ? rest.body : JSON.stringify(json) },
          env
        )
      );
    }
  };
}
