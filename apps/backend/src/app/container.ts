import { createD1PostRepository, type IdempotencyGate, type PostRepository } from '../modules/content';
import { createD1SessionStore, type SessionStore } from '../modules/identity';
import { createD1SettingsRepository, type SettingsRepository } from '../modules/settings';
import { type Clock, systemClock } from '../platform/clock';
import { createIdempotencyStore } from '../platform/idempotency/d1-idempotency-store';
import {
  createD1DestinationRepository,
  createD1DispatchRepository,
  createD1PublicationRepository,
  createTelegramChatInspector,
  createTelegramPublicationTransport,
  type ChatInspector,
  type DestinationRepository,
  type DispatchRepository,
  type PostRevisionSource,
  type PostSource,
  type PublicationRepository,
  type PublicationTransport
} from '../modules/publishing';
import {
  createTelegramApi,
  createTelegramBotAdminApi,
  createTelegramChatReadApi,
  type TelegramBotAdminApi,
  type TelegramChatReadApi
} from '../integrations/telegram/telegram-api';
import { type BotIdentityStore, createD1BotIdentityStore } from './bot/bot-identity-store';
import { purgeExpiredPlatformRows } from '../platform/housekeeping/d1-purge';
import { createD1RateLimiter, type RateLimiter } from '../platform/rate-limit/d1-rate-limiter';
import { randomToken } from '../platform/security/random-token';
import { createLogger, type Logger } from '../platform/logging/logger';
import { z } from 'zod';
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
  settings: SettingsRepository;
  destinations: DestinationRepository;
  publications: PublicationRepository;
  postSource: PostSource;
  /** Whether the Cron dispatcher may claim jobs: PUBLISHING_ENABLED is "true" and the bot token is set. */
  publishing: { enabled: boolean; blockedBy?: 'bot_token_missing' };
  dispatchJobs: DispatchRepository;
  postRevisions: PostRevisionSource;
  /** Built on first use from TELEGRAM_BOT_TOKEN; asking for it without the token is a 503. */
  transport: PublicationTransport;
  /** Read-only Telegram lookups for the destination check; asking for it without the token is a 503. */
  chatInspector: ChatInspector;
  /** Webhook, command and menu calls of the bot; asking for it without the token is a 503. */
  botAdminApi: TelegramBotAdminApi;
  /** The bot's own identity (`getMe`), stored by connect; read by the webhook instead of calling Telegram. */
  botIdentity: BotIdentityStore;
  housekeeping: {
    purgeExpired(input: { now: number; limit: number }): Promise<{ idempotencyKeys: number; rateLimits: number }>;
  };
  random: () => number;
  newId: () => string;
  newToken: () => string;
}

// `DB` is absent in a deployment whose D1 database has not been provisioned yet. Health must
// still answer there, so the database is resolved when a store is first used, and its absence
// is a 503 instead of a crash.
export interface ContainerEnv {
  DB?: D1Database;
  TELEGRAM_BOT_TOKEN?: string;
  /** Optional override: JSON of the Bot API `getMe` result. Without it connect stores the identity in D1. */
  BOT_INFO?: string;
  /** Kill switch: only the exact string "true" lets the dispatcher claim jobs. */
  PUBLISHING_ENABLED?: string;
}

export interface ContainerOverrides {
  clock?: Clock;
  transport?: PublicationTransport;
  /** Replaces the Bot API read calls (tests script it; nothing reaches the network). */
  telegramChatApi?: TelegramChatReadApi;
  /** Replaces the Bot API webhook/command calls (tests script it; nothing reaches the network). */
  telegramBotAdminApi?: TelegramBotAdminApi;
  random?: () => number;
  newId?: () => string;
}

const botIdSchema = z.object({ id: z.number().int().positive() });

// A missing or malformed BOT_INFO is not an error here: the check then asks Telegram with `getMe`.
function configuredBotId(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  try {
    const parsed = botIdSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.id : null;
  } catch {
    return null;
  }
}

export function createContainer(env: ContainerEnv, overrides: ContainerOverrides = {}): Container {
  // A token that is only whitespace (a pasted secret with a stray newline) is no token.
  const botToken = (): string => (env.TELEGRAM_BOT_TOKEN ?? '').trim();
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
    get settings() {
      return createD1SettingsRepository(db());
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
    // Read lazily like the stores: a request that never asks does not touch the environment.
    get publishing(): Container['publishing'] {
      const requested = env.PUBLISHING_ENABLED === 'true';
      const hasSender = overrides.transport !== undefined || botToken() !== '';
      return requested && !hasSender ? { enabled: false, blockedBy: 'bot_token_missing' } : { enabled: requested };
    },
    get dispatchJobs() {
      return createD1DispatchRepository(db());
    },
    // publishing asks for a revision snapshot through its own port; only this wiring knows the content module.
    get postRevisions(): PostRevisionSource {
      return createD1PostRepository(db());
    },
    get transport(): PublicationTransport {
      if (overrides.transport !== undefined) return overrides.transport;
      const token = botToken();
      if (token === '') throw new AppError('UNAVAILABLE', 'Telegram bot is not configured');
      return createTelegramPublicationTransport(createTelegramApi(token));
    },
    get chatInspector(): ChatInspector {
      let reader = overrides.telegramChatApi;
      if (reader === undefined) {
        const token = botToken();
        if (token === '') throw new AppError('UNAVAILABLE', 'Telegram bot is not configured');
        reader = createTelegramChatReadApi(token);
      }
      return createTelegramChatInspector({ reader, botId: configuredBotId(env.BOT_INFO), logger: createLogger() });
    },
    get botAdminApi(): TelegramBotAdminApi {
      if (overrides.telegramBotAdminApi !== undefined) return overrides.telegramBotAdminApi;
      const token = botToken();
      if (token === '') throw new AppError('UNAVAILABLE', 'Telegram bot is not configured');
      return createTelegramBotAdminApi(token);
    },
    // Resolved per call: a BOT_INFO override never touches the database, so a Worker without one still answers.
    get botIdentity(): BotIdentityStore {
      const logger = createLogger();
      return {
        load: () => createD1BotIdentityStore(db(), logger).load(),
        save: (info, now) => createD1BotIdentityStore(db(), logger).save(info, now)
      };
    },
    get housekeeping() {
      return { purgeExpired: (input: { now: number; limit: number }) => purgeExpiredPlatformRows(db(), input) };
    },
    // Jitter only; not for anything an attacker could use.
    random: overrides.random ?? Math.random,
    newId: overrides.newId ?? (() => crypto.randomUUID()),
    newToken: randomToken
  };
}
