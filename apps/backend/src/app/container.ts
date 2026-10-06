import { createD1PostRepository, type IdempotencyGate, type PostRepository } from '../modules/content';
import { createD1SessionStore, type SessionStore } from '../modules/identity';
import { type Clock, systemClock } from '../platform/clock';
import { createIdempotencyStore } from '../platform/idempotency/d1-idempotency-store';
import {
  createD1DestinationRepository,
  createD1PublicationRepository,
  type DestinationRepository,
  type PostSource,
  type PublicationRepository
} from '../modules/publishing';
import { createD1RateLimiter, type RateLimiter } from '../platform/rate-limit/d1-rate-limiter';
import { randomToken } from '../platform/security/random-token';
import { createLogger, type Logger } from '../platform/logging/logger';
import { AppError } from '../shared/app-error';

// The only place where real implementations are wired. It grows together with the modules
// (repositories, transports); nothing is registered here before it exists.
export interface Container {
  clock: Clock;
  logger: Logger;
  sessions: SessionStore;
  rateLimiter: RateLimiter;
  posts: PostRepository;
  idempotency: IdempotencyGate;
  destinations: DestinationRepository;
  publications: PublicationRepository;
  postSource: PostSource;
  newId: () => string;
  newToken: () => string;
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
    get rateLimiter() {
      return createD1RateLimiter(db());
    },
    get posts() {
      return createD1PostRepository(db());
    },
    get idempotency() {
      return createIdempotencyStore(db());
    },
    get destinations() {
      return createD1DestinationRepository(db());
    },
    get publications() {
      return createD1PublicationRepository(db());
    },
    // publishing asks for a post's state through its own port; only this wiring knows the content module.
    get postSource(): PostSource {
      const posts = createD1PostRepository(db());
      return {
        async findState(postId) {
          const post = await posts.findById(postId);
          return post === null ? null : { status: post.status, revision: post.revision };
        }
      };
    },
    newId: () => crypto.randomUUID(),
    newToken: randomToken
  };
}
