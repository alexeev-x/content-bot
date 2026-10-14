import {
  createD1PostRepository,
  createD1PostMediaRepository,
  type IdempotencyGate,
  type PostPublicationSummarySource,
  type PostMediaRepository,
  type PostRepository
} from '../modules/content';
import { createD1LifecycleRepository, type LifecycleRepository } from '../modules/lifecycle';
import { createD1SessionStore, parseOwnerTelegramId, type SessionStore } from '../modules/identity';
import { createD1SettingsRepository, type SettingsRepository } from '../modules/settings';
import { type Clock, systemClock } from '../platform/clock';
import { meterD1, type QueryBudget } from '../platform/d1-budget';
import { createIdempotencyStore } from '../platform/idempotency/d1-idempotency-store';
import {
  createD1DashboardRepository,
  createD1DestinationRepository,
  createD1DispatchRepository,
  createD1IncidentRepository,
  createD1PublicationRepository,
  createD1PublicationAnalyticsRepository,
  createTelegramChatInspector,
  createTelegramPublicationTransport,
  type ChatInspector,
  type DashboardRepository,
  type DestinationRepository,
  type DispatchRepository,
  type IncidentRepository,
  type PostRevisionSource,
  type PublicationMedia,
  type PostSource,
  type PublicationRepository,
  type PublicationAnalyticsRepository,
  type PublicationTransport
} from '../modules/publishing';
import {
  createTelegramApi,
  createTelegramBotAdminApi,
  createTelegramChatReadApi,
  createTelegramOwnerMessageApi,
  type TelegramBotAdminApi,
  type TelegramChatReadApi,
  type TelegramOwnerMessageApi
} from '../integrations/telegram/telegram-api';
import { type BotIdentityStore, createD1BotIdentityStore } from './bot/bot-identity-store';
import { createD1MediaImportStore, type MediaImportStore } from './bot/media-import-store';
import { createD1PublishActionStore, type PublishActionStore } from './bot/publish-action-store';
import { createD1UpdateDedup, type UpdateDedup } from './bot/update-dedup';
import { createD1SystemState, type SystemStateStore } from './system-state';
import { purgeExpiredPlatformRows, purgeOperationalRows } from '../platform/housekeeping/d1-purge';
import { createD1RateLimiter, type RateLimiter } from '../platform/rate-limit/d1-rate-limiter';
import { randomToken } from '../platform/security/random-token';
import { createLogger, type Logger } from '../platform/logging/logger';
import { createR2MediaStorage } from './r2-media-storage';
import { z } from 'zod';
import { AppError } from '../shared/app-error';
import {
  createD1DotaWatcherRepository,
  createD1SourceEventsRepository,
  type SourceEventsRepository,
  createOfficialDotaFetcher,
  inspectOfficialPatch,
  summarizeOfficialPatch,
  syncDotaUpdates,
  type DotaPatchSummary,
  type DotaPatchInspection,
  type DotaSourceFetcher,
  type DotaWatcherRepository
} from '../modules/dota';
import { createD1DotaWatchlists } from '../modules/dota-watchlists';
import {
  createD1DotaHeroStatisticsRepository,
  createDotaHeroStatisticsService,
  type DotaHeroStatisticsService
} from '../modules/dota-hero-statistics';
import { createOpenDotaHeroStatisticsFetcher } from '../integrations/opendota/hero-statistics';
import { createD1AutomationRepository, type AutomationRepository } from '../modules/automations';
import { type ActivityRepository, createD1ActivityRepository } from '../modules/activity';

// The only place where real implementations are wired. It grows together with the modules
// (repositories, transports); nothing is registered here before it exists.
export interface Container {
  clock: Clock;
  /** What this invocation has spent on D1 so far (the Free plan allows 50 subrequests per invocation). */
  queryBudget: QueryBudget;
  logger: Logger;
  sessions: SessionStore;
  rateLimiter: RateLimiter;
  posts: PostRepository;
  postMedia: PostMediaRepository;
  mediaStorage: ReturnType<typeof createR2MediaStorage> | undefined;
  /** Publication facts of posts for the post list; the content module asks for them through its own port. */
  postSummaries: PostPublicationSummarySource;
  /** Archive, restore, delete and purge of posts; the one place that changes posts and publications together. */
  lifecycle: LifecycleRepository;
  idempotency: IdempotencyGate;
  settings: SettingsRepository;
  activity: ActivityRepository;
  destinations: DestinationRepository;
  publications: PublicationRepository;
  publicationAnalytics: PublicationAnalyticsRepository;
  /** Incident list and acknowledgement (migrations 0005, 0010). */
  incidents: IncidentRepository;
  /** The owner's overview: one batch of bounded reads. */
  dashboard: DashboardRepository;
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
  /** Owner notices (a publication was scheduled or moved); null without a bot token, which only skips them. */
  ownerMessenger: TelegramOwnerMessageApi | null;
  /** The owner's Telegram ID as a chat id (a private chat has the user's id); null when OWNER_TELEGRAM_ID is not valid. */
  ownerChatId: string | null;
  /** The bot's own identity (`getMe`), stored by connect; read by the webhook instead of calling Telegram. */
  botIdentity: BotIdentityStore;
  /** The last Cron run and this Worker's public origin (migration 0009). */
  systemState: SystemStateStore;
  /** The bot token for Cron's file imports; null while it is not set. */
  botToken: string | null;
  /** Files the owner sent to the bot, waiting to be imported into their draft (migration 0034). */
  mediaImports: MediaImportStore;
  /** The bot's «publish now» buttons (migration 0035). */
  publishActions: PublishActionStore;
  /** Webhook update ids already seen (migration 0009): a replayed update is not processed twice. */
  webhookUpdates: UpdateDedup;
  /** Polls the two fixed official Dota feeds and persists deduped source items. */
  dotaWatcher: {
    sync(input: { detectedAt: number }): Promise<{ inserted: number; fetched: number }>;
    summarizePatch(version: string): Promise<DotaPatchSummary | null>;
    inspectPatch?(version: string): Promise<DotaPatchInspection>;
  };
  /** D1 state for draft reservation, Dota owner notices and deduped source incidents. */
  dotaRepository: DotaWatcherRepository;
  /** «Источники»: the events read model and hide flag over the Dota update items. */
  sourceEvents: SourceEventsRepository;
  dotaWatchlists: ReturnType<typeof createD1DotaWatchlists>;
  /** Persisted OpenDota hero observations; reads never fetch upstream. */
  dotaHeroStatistics: DotaHeroStatisticsService;
  /** Owner-visible history and conditional control for fixed Dota recurring work. */
  automations: AutomationRepository;
  housekeeping: {
    purgeExpired(input: { now: number; limit: number }): Promise<{ idempotencyKeys: number; rateLimits: number }>;
    purgeOperational(input: {
      now: number;
      limit: number;
    }): Promise<{ jobAttempts: number; resolvedIncidents: number; auditRows: number }>;
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
  MEDIA_BUCKET?: R2Bucket;
  TELEGRAM_BOT_TOKEN?: string;
  /** Optional override: JSON of the Bot API `getMe` result. Without it connect stores the identity in D1. */
  BOT_INFO?: string;
  /** Kill switch: only the exact string "true" lets the dispatcher claim jobs. */
  PUBLISHING_ENABLED?: string;
  OWNER_TELEGRAM_ID?: string;
}

export interface ContainerOverrides {
  clock?: Clock;
  transport?: PublicationTransport;
  /** Replaces the Bot API read calls (tests script it; nothing reaches the network). */
  telegramChatApi?: TelegramChatReadApi;
  /** Replaces the Bot API webhook/command calls (tests script it; nothing reaches the network). */
  telegramBotAdminApi?: TelegramBotAdminApi;
  /** Replaces the owner notice sender (tests record it; nothing reaches the network). */
  ownerMessenger?: TelegramOwnerMessageApi;
  random?: () => number;
  newId?: () => string;
  /** Replaces the fixed-host feed fetcher for deterministic Cron tests. */
  dotaFetcher?: DotaSourceFetcher;
  dotaRepository?: DotaWatcherRepository;
  dotaHeroStatistics?: DotaHeroStatisticsService;
  dotaHeroStatisticsFetcher?: () => Promise<Response>;
  /** Replaces the watcher when a test is focused on unrelated scheduled work. */
  dotaWatcher?: Container['dotaWatcher'];
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
  const botToken = (): string => (env?.TELEGRAM_BOT_TOKEN ?? '').trim();
  // Metered on first use: building a container must not touch the environment (tests and error paths
  // create the app without bindings), and one meter per container keeps the per-invocation count.
  let metered: ReturnType<typeof meterD1> | null = null;
  const meter = (): ReturnType<typeof meterD1> | null => {
    if (metered === null && env?.DB !== undefined) metered = meterD1(env.DB);
    return metered;
  };
  const db = (): D1Database => {
    const current = meter();
    if (current === null) throw new AppError('UNAVAILABLE', 'Database is not configured');
    return current.db;
  };
  const noBudget: QueryBudget = { limit: 0, used: () => 0, remaining: () => 0, charge: () => undefined };
  return {
    clock: overrides.clock ?? systemClock,
    get queryBudget(): QueryBudget {
      return meter()?.budget ?? noBudget;
    },
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
    get postMedia() {
      return createD1PostMediaRepository(db());
    },
    get mediaStorage() {
      return env.MEDIA_BUCKET === undefined ? undefined : createR2MediaStorage(env.MEDIA_BUCKET);
    },
    get postSummaries(): PostPublicationSummarySource {
      const publications = createD1PublicationRepository(db());
      return { summarize: (postIds, now) => publications.summarizeByPost(postIds, now) };
    },
    get lifecycle() {
      return createD1LifecycleRepository(db());
    },
    get idempotency() {
      return createIdempotencyStore(db());
    },
    get settings() {
      return createD1SettingsRepository(db());
    },
    get activity() {
      return createD1ActivityRepository(db());
    },
    get destinations() {
      return createD1DestinationRepository(db());
    },
    get publications() {
      return createD1PublicationRepository(db());
    },
    get publicationAnalytics() {
      return createD1PublicationAnalyticsRepository(db());
    },
    get incidents() {
      return createD1IncidentRepository(db());
    },
    get dashboard() {
      return createD1DashboardRepository(db());
    },
    // publishing asks for a post's state through its own port; only this wiring knows the content module.
    get postSource(): PostSource {
      const posts = createD1PostRepository(db());
      return {
        async findState(postId) {
          const post = await posts.findById(postId);
          return post === null
            ? null
            : { status: post.status, revision: post.revision, archived: post.archivedAt !== null };
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
      const posts = createD1PostRepository(db());
      const storage = env.MEDIA_BUCKET === undefined ? undefined : createR2MediaStorage(env.MEDIA_BUCKET);
      return {
        async findRevision(postId, revision) {
          const snapshot = await posts.findRevision(postId, revision);
          if (snapshot === null) return null;
          if (snapshot.media.length > 0 && storage === undefined) return null;
          const media: PublicationMedia[] = [];
          for (const asset of snapshot.media) {
            const object = await storage?.get(asset.objectKey);
            if (object === undefined || object === null) return null;
            media.push({
              kind: asset.kind,
              fileName: asset.fileName,
              contentType: asset.contentType,
              body: object.body
            });
          }
          return { title: snapshot.title, body: snapshot.body, entities: snapshot.entities, media };
        }
      };
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
    // Unlike the other Telegram clients, a missing token is not a 503: a notice is a courtesy.
    get ownerMessenger(): TelegramOwnerMessageApi | null {
      if (overrides.ownerMessenger !== undefined) return overrides.ownerMessenger;
      const token = botToken();
      return token === '' ? null : createTelegramOwnerMessageApi(token);
    },
    get ownerChatId(): string | null {
      const ownerId = parseOwnerTelegramId(env.OWNER_TELEGRAM_ID);
      return ownerId === null ? null : String(ownerId);
    },
    get systemState(): SystemStateStore {
      return createD1SystemState(db());
    },
    get botToken() {
      return botToken() === '' ? null : botToken();
    },
    get mediaImports(): MediaImportStore {
      return createD1MediaImportStore(db(), overrides.newId ?? (() => crypto.randomUUID()));
    },
    get publishActions(): PublishActionStore {
      return createD1PublishActionStore(db());
    },
    get webhookUpdates(): UpdateDedup {
      return createD1UpdateDedup(db());
    },
    get dotaWatcher() {
      if (overrides.dotaWatcher !== undefined) return overrides.dotaWatcher;
      const repo = createD1DotaWatcherRepository(db());
      const fetcher = overrides.dotaFetcher ?? createOfficialDotaFetcher();
      return {
        sync: ({ detectedAt }: { detectedAt: number }) => syncDotaUpdates({ fetcher, repo, detectedAt }),
        summarizePatch: (version: string) => summarizeOfficialPatch(fetcher, version),
        inspectPatch: (version: string) => inspectOfficialPatch(fetcher, version)
      };
    },
    get dotaRepository() {
      return overrides.dotaRepository ?? createD1DotaWatcherRepository(db());
    },
    get sourceEvents() {
      return createD1SourceEventsRepository(db());
    },
    get dotaWatchlists() {
      return createD1DotaWatchlists(db());
    },
    get dotaHeroStatistics() {
      if (overrides.dotaHeroStatistics !== undefined) return overrides.dotaHeroStatistics;
      const fetchHeroStatistics = overrides.dotaHeroStatisticsFetcher ?? createOpenDotaHeroStatisticsFetcher();
      return createDotaHeroStatisticsService({
        repo: createD1DotaHeroStatisticsRepository(db()),
        fetch: fetchHeroStatistics
      });
    },
    get automations() {
      return createD1AutomationRepository(db());
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
      return {
        purgeExpired: (input: { now: number; limit: number }) => purgeExpiredPlatformRows(db(), input),
        purgeOperational: (input: { now: number; limit: number }) => purgeOperationalRows(db(), input)
      };
    },
    // Jitter only; not for anything an attacker could use.
    random: overrides.random ?? Math.random,
    newId: overrides.newId ?? (() => crypto.randomUUID()),
    newToken: randomToken
  };
}
