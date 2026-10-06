import { createD1PostRepository, type IdempotencyGate, type PostRepository } from '../modules/content';
import { createD1SessionStore, type SessionStore } from '../modules/identity';
import { type Clock, systemClock } from '../platform/clock';
import { createIdempotencyStore } from '../platform/idempotency/d1-idempotency-store';
import { createLogger, type Logger } from '../platform/logging/logger';
import { AppError } from '../shared/app-error';

// The only place where real implementations are wired. It grows together with the modules
// (repositories, transports); nothing is registered here before it exists.
export interface Container {
  clock: Clock;
  logger: Logger;
  sessions: SessionStore;
  posts: PostRepository;
  idempotency: IdempotencyGate;
  newId: () => string;
}

// `DB` is absent in a deployment whose D1 database has not been provisioned yet. Health must
// still answer there, so the database is resolved when a store is first used, and its absence
// is a 503 instead of a crash.
export function createContainer(env: { DB?: D1Database }, overrides: { clock?: Clock } = {}): Container {
  const db = (): D1Database => {
    if (env.DB === undefined) throw new AppError('UNAVAILABLE', 'Database is not configured');
    return env.DB;
  };
  return {
    clock: overrides.clock ?? systemClock,
    logger: createLogger(),
    get sessions() {
      return createD1SessionStore(db());
    },
    get posts() {
      return createD1PostRepository(db());
    },
    get idempotency() {
      return createIdempotencyStore(db());
    },
    newId: () => crypto.randomUUID()
  };
}
