import {
  type AudienceRepository,
  type AudienceTargets,
  type AudienceTelegram,
  createD1AudienceRepository
} from '../modules/audience';
import { edgeTextCache, STRATZ_CACHE_SECONDS } from '../platform/edge-cache';
import {
  createD1PostRepository,
  createD1PostMediaRepository,
  type IdempotencyGate,
  type Post,
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
  type PublicationTransport,
  createD1PublicationOutcomesRepository,
  type PublicationOutcomesRepository
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
import { createGitHubRepoApi, type GitHubRepoApi } from '../integrations/github/github-api';
import { createOpenDotaApi, type OpenDotaApi } from '../integrations/opendota/opendota-api';
import { createStratzApi, type StratzApi } from '../integrations/stratz/stratz-api';
import { createD1HeroStats, type HeroStatsRepository } from '../modules/hero-stats';
import { createStratzMatches, type StratzMatchesApi } from '../integrations/stratz/stratz-matches';
import { stratzAccess } from './stats-access';
import {
  createD1GameFileBuilds,
  createD1SteamApps,
  createD1WatchChecks,
  type GameFileBuildRepository,
  type SteamAppRepository,
  type WatchCheckRepository
} from '../modules/game-files';
import { type AiJob, aiJobSchema } from './bot/ai-job';
import { type AutopublishLogStore, createD1AutopublishLog } from './workflows/autopublish-log';
import { type BotIdentityStore, createD1BotIdentityStore } from './bot/bot-identity-store';
import { createD1MediaImportStore, type MediaImportStore } from './bot/media-import-store';
import { createD1PublishActionStore, type PublishActionStore } from './bot/publish-action-store';
import { createD1UpdateDedup, type UpdateDedup } from './bot/update-dedup';
import { createD1SystemState, type SystemStateStore } from './system-state';
import { purgeExpiredPlatformRows, purgeOperationalRows } from '../platform/housekeeping/d1-purge';
import { createD1RateLimiter, type RateLimiter } from '../platform/rate-limit/d1-rate-limiter';
import { randomToken } from '../platform/security/random-token';
import { createLogger, type Logger } from '../platform/logging/logger';
import {
  type AiRepository,
  type AiImageProvider,
  type AiTextProvider,
  type DraftHistoryRepository,
  type RulesRepository,
  type StyleLessonsRepository,
  type HypothesesRepository,
  createD1AiRepository,
  createD1AuthorProfileRepository,
  createD1ReviewRepository,
  createD1DraftHistoryRepository,
  createD1RulesRepository,
  createD1StyleLessonsRepository,
  createD1HypothesesRepository,
  createD1ScriptLinksRepository,
  createD1WriterRepository,
  type AuthorProfileRepository,
  createAnthropicProvider,
  createModelRouter,
  createOpenAiImageProvider,
  createOpenAiProvider,
  type OwnerPostSource,
  type ReviewRepository,
  type ReviewVideoSource,
  type ScriptLinksRepository,
  type WriterRepository
} from '../modules/ai';
import { createR2MediaStorage } from './r2-media-storage';
import { z } from 'zod';
import { AppError } from '../shared/app-error';
import {
  createD1DotaWatcherRepository,
  createD1SeriesRepository,
  createD1TreasureWatchRepository,
  type TreasureWatchRepository,
  createD1SourceEventsRepository,
  type SeriesRepository,
  type SourceEventsRepository,
  createOfficialDotaFetcher,
  digestOfficialPatch,
  latestPatchVersion,
  inspectOfficialPatch,
  summarizeOfficialPatch,
  syncDotaUpdates,
  type DotaPatchSummary,
  type DotaPatchInspection,
  type PatchDigest,
  type DotaSourceFetcher,
  type DotaWatcherRepository
} from '../modules/dota';
import { createD1DotaWatchlists } from '../modules/dota-watchlists';
import { createD1AutomationRepository, type AutomationRepository } from '../modules/automations';
import { type ActivityRepository, createD1ActivityRepository } from '../modules/activity';
import {
  type ConfiguredSources,
  type ContentAlertRepository,
  type ContentAnalyticsRepository,
  type ContentDailyReportRepository,
  type ContentForecastRepository,
  type ContentVideoNameRepository,
  configuredCollectors,
  createD1ContentAlertRepository,
  createD1ContentDailyReportRepository,
  createD1ContentForecastRepository,
  createD1ContentVideoNameRepository,
  createD1ContentGoalRepository,
  type ContentGoalRepository,
  createD1ContentAnalyticsRepository,
  createD1TikTokConnectionRepository,
  listReviewVideoIds,
  readReviewVideo,
  type TikTokConnectionRepository
} from '../modules/content-analytics';

// The only place where real implementations are wired. It grows together with the modules
// (repositories, transports); nothing is registered here before it exists.
/** Where the removed hero files were kept in R2 (`dota/heroes/<slug>/<kind>.<ext>`). */
const HERO_FILES_PREFIX = 'dota/heroes/';
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
  /** The channel's reactions, poll votes and comments (migration 0118). */
  audience: AudienceRepository;
  /** The enabled channels the bot publishes to: the audience setup check reads them. */
  audienceTargets: AudienceTargets;
  /** Telegram's getChat/getChatMember for the audience setup check. */
  audienceTelegram: AudienceTelegram;
  /** Whether the Worker secret AUDIENCE_HASH_KEY is set (comments are kept only then). */
  audienceHashKeySet: boolean;
  /** What publishing did with posts, for the rubric scheduler and the audience health step. */
  publicationOutcomes: PublicationOutcomesRepository;
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
    /** A patch's notes for its post (owner, 22.10.2026); null when Valve has none for the version yet. */
    digestPatch?(version: string): Promise<PatchDigest | null>;
    /** The newest version in Valve's patch list (a hotfix's picture shows it). */
    latestPatchVersion?(): Promise<string | null>;
  };
  /** D1 state for draft reservation, Dota owner notices and deduped source incidents. */
  dotaRepository: DotaWatcherRepository;
  /** «Источники»: the events read model and hide flag over the Dota update items. */
  sourceEvents: SourceEventsRepository;
  sourceSeries: SeriesRepository;
  /** The Liquipedia watch of a treasure announced without its own page (migration 0101). */
  treasureWatches: TreasureWatchRepository;
  /** The builds of the game's files already seen (migration 0107). */
  gameFileBuilds: GameFileBuildRepository;
  /** What Steam last said about Dota's apps (migration 0108). */
  steamApps: SteamAppRepository;
  watchChecks: WatchCheckRepository;
  autopublishLog: AutopublishLogStore;
  /** The game-files tracker on GitHub; null without `GITHUB_TOKEN`, which only leaves the source off. */
  gameFilesRepo: GitHubRepoApi | null;
  /** The hero statistics base (its own database, `STATS_DB`); null where it is not bound (DEV never runs it). */
  heroStats: HeroStatsRepository | null;
  /** STRATZ reads of the statistics base; null without `STRATZ_TOKEN` and the bridge. */
  statsMatches: StratzMatchesApi | null;
  /** The nightly statistics Workflow; null where it is not bound. */
  statsSnapshot: Workflow | null;
  /** STRATZ and OpenDota through the stats bridge; null without `STRATZ_TOKEN` and `STATS_BRIDGE_URL`. */
  statsApis: { stratz: StratzApi; openDota: OpenDotaApi } | null;
  dotaWatchlists: ReturnType<typeof createD1DotaWatchlists>;
  /** Owner-visible history and conditional control for fixed Dota recurring work. */
  automations: AutomationRepository;
  /** Counters of the owner's own Telegram, YouTube and TikTok (migration 0043). */
  contentAnalytics: ContentAnalyticsRepository;
  /** Bot alerts about the counters: a publication off its usual curve, a source outage, the reports (0047). */
  contentAlerts: ContentAlertRepository;
  /** Follower goals per platform (0048). */
  contentGoals: ContentGoalRepository;
  /** `ANALYTICS_TELEGRAM_CHANNEL`: the channel the analytics reads. */
  analyticsTelegramChannel: string | undefined;
  /** The daily report's forecasts and their scores (0076). */
  contentForecasts: ContentForecastRepository;
  contentVideoNames: ContentVideoNameRepository;
  /** The daily reports: stored numbers, the AI review and its status (0077). */
  contentDailyReports: ContentDailyReportRepository;
  /** The content sources this environment configures (vars, the YouTube key, the TikTok app keys). */
  contentSources: ConfiguredSources;
  /** The connected TikTok account: OAuth states and encrypted tokens (migration 0044). */
  tiktokConnections: TikTokConnectionRepository;
  /** Outbound fetch of the content integrations; tests replace it. */
  contentFetch: typeof fetch;
  /** Official hero media mirrored from Valve's CDN into R2 (migration 0050). */
  /** AI writer settings, spend and connection checks (migration 0053). */
  aiRepository: AiRepository;
  /** The configured text-model provider; null without its key. */
  aiProvider: AiTextProvider | null;
  /** Draws the patch pictures (OpenAI's image model); null without the OpenAI key. */
  aiImageProvider: AiImageProvider | null;
  /** Which AI providers have a key (the settings page and the comparison). */
  aiKeys: Record<'openai' | 'anthropic', boolean>;
  /** The blind provider comparison (migration 0093). */
  /** The AI writer's managed memory: the owner's rules and the approved analysis rules (0079). */
  aiRules: RulesRepository;
  /** What the owner's edits and remarks teach the writer (AI plan P7c, migration 0084). */
  aiStyleLessons: StyleLessonsRepository;
  /** The analyst's hypotheses H1, H2… (migration 0086), reviewed every Monday. */
  aiHypotheses: HypothesesRepository;
  /** The studio's history of AI drafts (AI plan P8, read-only). */
  aiDraftHistory: DraftHistoryRepository;
  /** The bot's AI model calls go through Queue AI_JOBS (owner, 19.10.2026); UNAVAILABLE without the binding. */
  aiJobs: { send: (job: AiJob, options?: { delaySeconds?: number }) => Promise<void> };
  /** AI drafts, their revisions with provenance and the owner's feedback (migration 0054). */
  aiWriter: WriterRepository;
  /** The owner's own Telegram posts for the writer, read through the content module (stage 2 of the AI plan). */
  aiOwnerPosts: OwnerPostSource;
  /** «Обо мне»: the author's state for every AI request (migration 0058). */
  aiProfiles: AuthorProfileRepository;
  /** Published videos ↔ approved AI scripts, confirmed by the owner (migration 0060). */
  aiScriptLinks: ScriptLinksRepository;
  /** One review per YouTube/TikTok video at 72 h (migration 0072). */
  aiReviews: ReviewRepository;
  /** The videos the reviews read, through the content-analytics module (consumer-owned port). */
  aiReviewVideos: ReviewVideoSource;
  /**
   * The mirrored Dota hero files, removed 24.10.2026 (owner: «с бд удали тоже»): deletes up to `limit` of them from
   * R2 per call and says how many it deleted. Undefined without the bucket.
   */
  purgeHeroFiles: ((limit: number) => Promise<number>) | undefined;
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
  AI_JOBS?: Queue<AiJob>;
  MEDIA_BUCKET?: R2Bucket;
  TELEGRAM_BOT_TOKEN?: string;
  /** Optional override: JSON of the Bot API `getMe` result. Without it connect stores the identity in D1. */
  BOT_INFO?: string;
  /** Kill switch: only the exact string "true" lets the dispatcher claim jobs. */
  PUBLISHING_ENABLED?: string;
  /** Studio AI drafts per 10 minutes; dev raises it for control runs, unset means 20. */
  AI_DRAFT_LIMIT?: string;
  /** Browser Rendering (dev only): the rubric pictures of «Тестирование» (app/lab). */
  BROWSER?: unknown;
  STRATZ_TOKEN?: string;
  STATS_BRIDGE_URL?: string;
  AUDIENCE_HASH_KEY?: string;
  /** The hero statistics database (owner, 29.10.2026); bound locally and on production only. */
  STATS_DB?: D1Database;
  STATS_SNAPSHOT?: Workflow;
  /** "true" only in local runs: STRATZ and OpenDota are called directly, without the bridge. */
  STATS_DIRECT?: string;
  OWNER_TELEGRAM_ID?: string;
  /** Public username of the owner's channel; empty means content analytics skips Telegram. */
  ANALYTICS_TELEGRAM_CHANNEL?: string;
  /** `UC…` id of the owner's YouTube channel; collected only with YOUTUBE_API_KEY. */
  ANALYTICS_YOUTUBE_CHANNEL_ID?: string;
  /** Worker secret: YouTube Data API v3 key (public counters only). */
  YOUTUBE_API_KEY?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  /** Worker secrets: TikTok for Developers app (Login Kit + Display API). */
  TIKTOK_CLIENT_KEY?: string;
  TIKTOK_CLIENT_SECRET?: string;
  /** Worker secret: a GitHub token with no scopes, for the game-files tracker (5 000 calls an hour). */
  GITHUB_TOKEN?: string;
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
  /** Replaces the watcher when a test is focused on unrelated scheduled work. */
  dotaWatcher?: Container['dotaWatcher'];
  /** Replaces the outbound fetch of the content collectors (tests script it). */
  contentFetch?: typeof fetch;
  /** Replaces the game-files tracker (tests script it; nothing reaches GitHub). */
  gameFilesRepo?: GitHubRepoApi | null;
  /** Replaces STRATZ and OpenDota (tests script them). */
  statsApis?: Container['statsApis'];
  /** Replaces the statistics base's STRATZ reads (tests script them). */
  statsMatches?: StratzMatchesApi | null;
  /** Replaces the AI provider (tests); null forces «no key». */
  aiProvider?: AiTextProvider | null;
  /** Replaces the image provider (tests); null forces «no key». */
  aiImageProvider?: AiImageProvider | null;
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
            : {
                status: post.status,
                revision: post.revision,
                archived: post.archivedAt !== null,
                mediaPendingUntil: post.mediaPendingUntil
              };
        }
      };
    },
    // Read lazily like the stores: a request that never asks does not touch the environment.
    get publishing(): Container['publishing'] {
      const requested = env.PUBLISHING_ENABLED === 'true';
      const hasSender = overrides.transport !== undefined || botToken() !== '';
      return requested && !hasSender ? { enabled: false, blockedBy: 'bot_token_missing' } : { enabled: requested };
    },
    get audience() {
      return createD1AudienceRepository(db());
    },
    get audienceTargets(): AudienceTargets {
      const destinations = createD1DestinationRepository(db());
      return {
        channels: async () =>
          (await destinations.list({ enabled: true, limit: 20 }))
            .filter((destination) => destination.kind === 'channel')
            .map((destination) => ({ chatId: destination.chatId, title: destination.title }))
      };
    },
    get dispatchJobs() {
      // Production without migration 0117 keeps publishing on the old statements; the log line says so.
      return createD1DispatchRepository(db(), () =>
        createLogger().warn({
          component: 'dispatch',
          operation: 'schema',
          status: 'behind',
          errorCode: 'SCHEMA_BEHIND'
        })
      );
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
              sizeBytes: object.size,
              body: object.body
            });
          }
          return {
            title: snapshot.title,
            titleInMessage: snapshot.titleInMessage,
            body: snapshot.body,
            entities: snapshot.entities,
            kind: snapshot.kind,
            poll: snapshot.poll,
            sendOptions: snapshot.sendOptions,
            richHtml: snapshot.richHtml,
            media
          };
        }
      };
    },
    get transport(): PublicationTransport {
      if (overrides.transport !== undefined) return overrides.transport;
      const token = botToken();
      if (token === '') throw new AppError('UNAVAILABLE', 'Telegram bot is not configured');
      return createTelegramPublicationTransport(createTelegramApi(token));
    },
    get audienceHashKeySet() {
      return (env.AUDIENCE_HASH_KEY ?? '') !== '';
    },
    get publicationOutcomes() {
      return createD1PublicationOutcomesRepository(db());
    },
    get audienceTelegram(): AudienceTelegram {
      if (overrides.telegramChatApi !== undefined) return overrides.telegramChatApi;
      const token = botToken();
      if (token === '') throw new AppError('UNAVAILABLE', 'Telegram bot is not configured');
      return createTelegramChatReadApi(token);
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
        inspectPatch: (version: string) => inspectOfficialPatch(fetcher, version),
        digestPatch: (version: string) => digestOfficialPatch(fetcher, version),
        latestPatchVersion: () => latestPatchVersion(fetcher)
      };
    },
    get dotaRepository() {
      return overrides.dotaRepository ?? createD1DotaWatcherRepository(db());
    },
    get sourceSeries() {
      return createD1SeriesRepository(db());
    },
    get treasureWatches() {
      return createD1TreasureWatchRepository(db());
    },
    get gameFileBuilds() {
      return createD1GameFileBuilds(db());
    },
    get steamApps() {
      return createD1SteamApps(db());
    },
    get watchChecks() {
      return createD1WatchChecks(db());
    },
    get autopublishLog() {
      return createD1AutopublishLog(db());
    },
    get gameFilesRepo(): GitHubRepoApi | null {
      if (overrides.gameFilesRepo !== undefined) return overrides.gameFilesRepo;
      const token = env.GITHUB_TOKEN?.trim() ?? '';
      return token === '' ? null : createGitHubRepoApi({ owner: 'SteamTracking', repo: 'GameTracking-Dota2', token });
    },
    get heroStats() {
      return env.STATS_DB === undefined ? null : createD1HeroStats(env.STATS_DB);
    },
    get statsMatches(): StratzMatchesApi | null {
      if (overrides.statsMatches !== undefined) return overrides.statsMatches;
      const access = stratzAccess(env.STRATZ_TOKEN, env.STATS_BRIDGE_URL, env.STATS_DIRECT);
      return access === null ? null : createStratzMatches(access);
    },
    get statsSnapshot() {
      return env.STATS_SNAPSHOT ?? null;
    },
    get statsApis(): Container['statsApis'] {
      if (overrides.statsApis !== undefined) return overrides.statsApis;
      const access = stratzAccess(env.STRATZ_TOKEN, env.STATS_BRIDGE_URL, env.STATS_DIRECT);
      return access === null
        ? null
        : {
            stratz: createStratzApi({ ...access, cache: edgeTextCache('stratz', STRATZ_CACHE_SECONDS) }),
            openDota: createOpenDotaApi({ bridgeUrl: access.bridgeUrl, spareBridgeUrl: access.spareBridgeUrl })
          };
    },
    get sourceEvents() {
      return createD1SourceEventsRepository(db(), () => (overrides.clock ?? systemClock).now());
    },
    get dotaWatchlists() {
      return createD1DotaWatchlists(db());
    },
    get automations() {
      return createD1AutomationRepository(db());
    },
    get contentAnalytics() {
      return createD1ContentAnalyticsRepository(db());
    },
    get contentAlerts() {
      return createD1ContentAlertRepository(db());
    },
    get contentGoals() {
      return createD1ContentGoalRepository(db());
    },
    get analyticsTelegramChannel() {
      return env?.ANALYTICS_TELEGRAM_CHANNEL;
    },
    get contentForecasts() {
      return createD1ContentForecastRepository(db());
    },
    get contentVideoNames() {
      return createD1ContentVideoNameRepository(db());
    },
    get contentDailyReports() {
      return createD1ContentDailyReportRepository(db());
    },
    get contentSources() {
      return configuredCollectors(
        {
          telegramChannel: env?.ANALYTICS_TELEGRAM_CHANNEL,
          youtubeChannelId: env?.ANALYTICS_YOUTUBE_CHANNEL_ID,
          youtubeApiKey: env?.YOUTUBE_API_KEY,
          tiktokClientKey: env?.TIKTOK_CLIENT_KEY,
          tiktokClientSecret: env?.TIKTOK_CLIENT_SECRET
        },
        overrides.contentFetch,
        { connections: createD1TikTokConnectionRepository(db()), clock: overrides.clock ?? systemClock }
      );
    },
    get tiktokConnections() {
      return createD1TikTokConnectionRepository(db());
    },
    get contentFetch(): typeof fetch {
      // A wrapper, not the global itself: Workers' fetch throws «Illegal invocation» when a caller invokes it
      // as a method of another object (`deps.fetchImpl(url)`).
      return overrides.contentFetch ?? ((input, init) => fetch(input, init));
    },
    get aiRepository() {
      return createD1AiRepository(db());
    },
    get aiWriter() {
      return createD1WriterRepository(db());
    },
    get aiOwnerPosts(): OwnerPostSource {
      const posts = createD1PostRepository(db());
      const own = (post: Post | null) =>
        post !== null && post.status === 'approved' && post.kind === 'text' && post.body.trim() !== ''
          ? { id: post.id, text: post.body, createdAt: post.updatedAt }
          : null;
      return {
        // A sent post goes to the archive, so the archive is read too (it holds only the retention period).
        recent: async (limit) => {
          const half = Math.min(Math.ceil(limit / 2), 50);
          const [live, archived] = await Promise.all([
            posts.list({ view: 'live', status: 'approved', limit: half }),
            posts.list({ view: 'archive', limit: half })
          ]);
          return [...live, ...archived]
            .flatMap((post) => {
              const row = own(post);
              return row === null ? [] : [row];
            })
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, limit);
        },
        find: async (id) => own(await posts.findById(id))
      };
    },
    get aiProfiles() {
      return createD1AuthorProfileRepository(db());
    },
    get aiScriptLinks() {
      return createD1ScriptLinksRepository(db());
    },
    get aiReviews() {
      return createD1ReviewRepository(db());
    },
    get aiReviewVideos(): ReviewVideoSource {
      const repo = createD1ContentAnalyticsRepository(db());
      const formats = createD1ScriptLinksRepository(db());
      const clock = overrides.clock ?? systemClock;
      return {
        dueIds: (input) => listReviewVideoIds(repo, input),
        read: (id) => readReviewVideo({ repo, clock, formats }, id),
        find: async (id) => {
          const found = await repo.readItem(id);
          return found === null || found.item.platform === 'telegram'
            ? null
            : { platform: found.item.platform, publishedAt: found.item.publishedAt };
        }
      };
    },
    // Each call goes to the provider of its model (Claude next to OpenAI, owner 21.10.2026); null with no key at all.
    get aiProvider() {
      if (overrides.aiProvider !== undefined) return overrides.aiProvider;
      const openaiKey = env.OPENAI_API_KEY?.trim();
      const anthropicKey = env.ANTHROPIC_API_KEY?.trim();
      return createModelRouter({
        openai: openaiKey ? createOpenAiProvider(openaiKey, (input, init) => fetch(input, init)) : null,
        anthropic: anthropicKey ? createAnthropicProvider(anthropicKey) : null
      });
    },
    get aiImageProvider() {
      if (overrides.aiImageProvider !== undefined) return overrides.aiImageProvider;
      const openaiKey = env.OPENAI_API_KEY?.trim();
      return openaiKey ? createOpenAiImageProvider(openaiKey, (input, init) => fetch(input, init)) : null;
    },
    /** Which providers have a key (the settings page and the comparison need to know). */
    get aiKeys(): Record<'openai' | 'anthropic', boolean> {
      return { openai: Boolean(env.OPENAI_API_KEY?.trim()), anthropic: Boolean(env.ANTHROPIC_API_KEY?.trim()) };
    },
    get aiDraftHistory() {
      return createD1DraftHistoryRepository(db());
    },
    get aiStyleLessons() {
      return createD1StyleLessonsRepository(db());
    },
    get aiHypotheses() {
      return createD1HypothesesRepository(db());
    },
    get aiRules() {
      return createD1RulesRepository(db());
    },
    get aiJobs() {
      return {
        send: async (job: AiJob, options?: { delaySeconds?: number }) => {
          if (env.AI_JOBS === undefined)
            throw new AppError('UNAVAILABLE', 'The AI queue is not bound', { reason: 'NO_QUEUE' });
          // Checked here, where the caller can still react: the consumer drops a job its schema refuses, silently
          // for whoever queued it (review 24.10.2026: a treasure follow-up over the task's bound was lost).
          const parsed = aiJobSchema.safeParse(job);
          if (!parsed.success)
            throw new AppError('VALIDATION_ERROR', 'The AI job does not fit its schema', { reason: 'AI_JOB_INVALID' });
          await env.AI_JOBS.send(
            job,
            options?.delaySeconds === undefined ? undefined : { delaySeconds: options.delaySeconds }
          );
        }
      };
    },
    get purgeHeroFiles() {
      const bucket = env.MEDIA_BUCKET;
      if (bucket === undefined) return undefined;
      return async (limit: number) => {
        const listed = await bucket.list({ prefix: HERO_FILES_PREFIX, limit });
        const keys = listed.objects.map((object) => object.key);
        if (keys.length > 0) await bucket.delete(keys);
        return keys.length;
      };
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
