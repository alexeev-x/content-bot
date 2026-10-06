import { publicationSchema } from '@alexeev/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app/create-app';
import type { AppEnv } from '../../src/app/env';
import { testDb } from '../helpers/db';
import { createApi, fakeClock, OWNER_ID, OWNER_TOKEN, resetDb, seedSession, START } from '../helpers/harness';
import { seedApprovedPost, seedDestination } from '../helpers/publishing';

// Free plan: 50 D1 queries per invocation. Each endpoint's D1 round trips (a batch is one) are
// pinned here, authentication included, so a new query in a handler shows up as a failing test.
interface Counter {
  roundTrips: number;
  statements: number;
}

function countingDb(db: D1Database, counter: Counter): D1Database {
  const real = new WeakMap<object, D1PreparedStatement>();
  const wrap = (statement: D1PreparedStatement): D1PreparedStatement => {
    const wrapped = new Proxy(statement, {
      get(target, property) {
        if (property === 'bind') {
          return (...values: unknown[]) => wrap(target.bind(...values));
        }
        if (property === 'run' || property === 'all' || property === 'first' || property === 'raw') {
          return (...args: unknown[]) => {
            counter.roundTrips += 1;
            counter.statements += 1;
            return (target[property] as (...a: unknown[]) => unknown)(...args);
          };
        }
        return Reflect.get(target, property) as unknown;
      }
    });
    real.set(wrapped, statement);
    return wrapped;
  };
  return new Proxy(db, {
    get(target, property) {
      if (property === 'prepare') return (sql: string) => wrap(target.prepare(sql));
      if (property === 'batch') {
        return (statements: D1PreparedStatement[]) => {
          counter.roundTrips += 1;
          counter.statements += statements.length;
          return target.batch(statements.map((statement) => real.get(statement) ?? statement));
        };
      }
      return Reflect.get(target, property) as unknown;
    }
  });
}

const MINUTE = 60_000;
let postId: string;
let destinationId: string;

beforeEach(async () => {
  await resetDb();
  await seedSession({ token: OWNER_TOKEN, expiresAt: START + 400 * 24 * 60 * MINUTE });
  const seeding = createApi({ clock: fakeClock() });
  postId = (await seedApprovedPost(seeding)).id;
  destinationId = (await seedDestination(seeding)).id;
});

async function measure(
  path: string,
  init: { method?: string; json?: unknown; headers?: Record<string, string> } = {}
): Promise<{ status: number; body: unknown; counter: Counter }> {
  const counter = { roundTrips: 0, statements: 0 };
  const app = createApp({ clock: fakeClock() });
  const env = { DB: countingDb(testDb(), counter), OWNER_TELEGRAM_ID: OWNER_ID } as AppEnv;
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${OWNER_TOKEN}`);
  if (init.json !== undefined) headers.set('content-type', 'application/json');
  const response = await app.request(
    path,
    { method: init.method, headers, body: init.json === undefined ? undefined : JSON.stringify(init.json) },
    env
  );
  return { status: response.status, body: await response.json(), counter };
}

describe('D1 round trips per request (session lookup included)', () => {
  it('destinations', async () => {
    const created = await measure('/api/v1/destinations', {
      method: 'POST',
      headers: { 'idempotency-key': 'budget-1' },
      json: { title: 'New', chatId: '-100777', kind: 'group' }
    });
    expect(created.status).toBe(201);
    expect(created.counter).toEqual({ roundTrips: 3, statements: 5 }); // session, claim, batch of 3
    const id = (created.body as { id: string }).id;

    const replay = await measure('/api/v1/destinations', {
      method: 'POST',
      headers: { 'idempotency-key': 'budget-1' },
      json: { title: 'New', chatId: '-100777', kind: 'group' }
    });
    expect(replay.status).toBe(201);
    expect(replay.counter.roundTrips).toBe(3); // session, failed claim, read of the stored response

    expect((await measure('/api/v1/destinations?limit=50')).counter.roundTrips).toBe(2);
    expect((await measure(`/api/v1/destinations/${id}`)).counter.roundTrips).toBe(2);
    const patched = await measure(`/api/v1/destinations/${id}`, {
      method: 'PATCH',
      json: { revision: 0, title: 'N2' }
    });
    expect(patched.status).toBe(200);
    expect(patched.counter).toEqual({ roundTrips: 2, statements: 3 }); // session, batch of 2
  });

  it('publications', async () => {
    const created = await measure('/api/v1/publications', {
      method: 'POST',
      headers: { 'idempotency-key': 'budget-2' },
      json: {
        postId,
        revision: 1,
        destinationId,
        scheduledAt: new Date(START + 10 * MINUTE).toISOString(),
        timezone: 'UTC'
      }
    });
    expect(created.status).toBe(202);
    // session, claim, post, destination, batch of 4
    expect(created.counter).toEqual({ roundTrips: 5, statements: 8 });
    const id = publicationSchema.parse(created.body).id;

    expect((await measure('/api/v1/publications?limit=100&status=scheduled')).counter.roundTrips).toBe(2);
    expect((await measure(`/api/v1/publications/${id}`)).counter.roundTrips).toBe(2);
    const moved = await measure(`/api/v1/publications/${id}/reschedule`, {
      method: 'POST',
      json: { revision: 0, scheduledAt: new Date(START + 20 * MINUTE).toISOString(), timezone: 'UTC' }
    });
    expect(moved.status).toBe(200);
    expect(moved.counter).toEqual({ roundTrips: 2, statements: 5 }); // session, batch of 4
    const cancelled = await measure(`/api/v1/publications/${id}/cancel`, { method: 'POST', json: { revision: 1 } });
    expect(cancelled.status).toBe(200);
    expect(cancelled.counter).toEqual({ roundTrips: 2, statements: 5 });
  });
});
