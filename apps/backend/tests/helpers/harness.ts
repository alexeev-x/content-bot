import type { AiTextProvider } from '../../src/modules/ai';
import type {
  TelegramBotAdminApi,
  TelegramInviteLinkApi,
  TelegramChatReadApi,
  TelegramOwnerMessageApi
} from '../../src/integrations/telegram/telegram-api';
import { handleAiQueue } from '../../src/app/ai-queue';
import { createContainer, type ContainerOverrides } from '../../src/app/container';
import { createApp } from '../../src/app/create-app';
import type { AppEnv } from '../../src/app/env';
import { mountLocalSignIn } from '../../src/app/local-sign-in-route';
import type { Clock } from '../../src/platform/clock';
import { sha256Hex } from '../../src/platform/security/sha256';
import { testDb } from './db';
import { testMediaBucket } from './media-bucket';
import { type FakeOwnerMessenger, fakeOwnerMessenger } from './fake-owner-messenger';

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
      'dota_watch_alerts',
      'dota_watch_matches',
      'dota_watches',
      'dota_patch_analyses',
      'dota_source_incidents',
      'dota_update_items',
      'dota_source_state',
      'incidents',
      'incident_alert_groups',
      'automation_runs',
      'content_item_snapshots',
      'content_report_cache',
      'content_item_formats',
      'content_item_contamination',
      'content_alerts',
      'content_goals',
      'content_post_rubrics',
      'content_rubrics',
      'channel_joins',
      'invite_links',
      'dota_hero_assets',
      'ai_writer_requests',
      'ai_queue_jobs',
      'ai_hypotheses',
      'ai_style_sources',
      'ai_style_lessons',
      'ai_rule_evidence',
      'ai_rules',
      'content_daily_reports',
      'ai_script_prompts',
      'content_forecasts',
      'ai_writer_fact_answers',
      'ai_author_profile',
      'content_ai_links',
      'ai_video_reviews',
      'ai_learning_exclusions',
      'ai_learning_inclusions',
      'ai_feedback',
      'ai_text_revisions',
      'ai_generations',
      'ai_usage',
      'ai_settings',
      'ai_budget_alerts',
      'ai_connection_checks',
      'content_items',
      'content_audience_days',
      'content_connections',
      'content_oauth_states',
      'manual_analytics_observations',
      'analytics_snapshots',
      'dota_hero_stats_snapshots',
      'dota_hero_stats_state',
      'bot_publish_actions',
      'job_attempts',
      'jobs',
      'publications',
      'destinations',
      'bot_media_import_files',
      'bot_media_download_lease',
      'bot_media_imports',
      'post_media',
      'post_media_uploads',
      'media_derivations',
      'post_media_crops',
      'post_media_cleanup',
      'media_assets',
      'post_revisions',
      'audit_log',
      'settings',
      'dashboard_layout',
      'bot_identity',
      'system_state',
      'webhook_updates',
      'idempotency_keys',
      'posts',
      'rate_limits',
      'widget_sign_ins',
      'refresh_tokens',
      'sessions'
    ].map((table) => db.prepare(`DELETE FROM ${table}`))
  );
  await db.prepare('UPDATE automations SET enabled = 1, revision = 0, updated_at = 0').run();
  await db
    .prepare(
      'UPDATE content_sources SET next_run_at = 0, claimed_at = 0, last_success_at = NULL, last_error_at = NULL, last_error_code = NULL'
    )
    .run();
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
  /** Notices that would reach the owner's chat (the fake that replaced Telegram). */
  ownerMessages: FakeOwnerMessenger['sent'];
  /** Queue AI_JOBS: what the app sent, and a redelivery of a sent body through the consumer. */
  aiJobs: { sent: unknown[]; deliver: (body: unknown) => Promise<void> };
  /** Waits until everything handed to `waitUntil` so far has ended. */
  settle(): Promise<void>;
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
    /** Scripts the invite link calls (createChatInviteLink, revokeChatInviteLink). */
    inviteLinkApi?: TelegramInviteLinkApi;
    webhookSecret?: string;
    botInfo?: string;
    /** Replaces the default recording fake. Without a bot token the real container path (no messenger) is used. */
    ownerMessenger?: TelegramOwnerMessageApi;
    /** Replaces the test database, for example with a metered one. */
    db?: D1Database;
    /** Extra Worker variables and secrets (content analytics keys). */
    env?: Partial<AppEnv>;
    /** Replaces the outbound fetch of the content integrations (TikTok, YouTube, Telegram preview). */
    contentFetch?: typeof fetch;
    /** Replaces the AI provider; null means «no key». Default: no key. */
    aiProvider?: AiTextProvider | null;
    /** Mounts the `npm run dev` sign-in (app/local-sign-in-route.ts), as src/index.ts does on the dev server. */
    localSignIn?: boolean;
  } = {}
): Api {
  const messenger = fakeOwnerMessenger();
  const clock = options.clock ?? fakeClock();
  const overrides: ContainerOverrides = {
    clock,
    telegramChatApi: options.chatApi,
    telegramBotAdminApi: options.botAdminApi,
    telegramInviteLinkApi: options.inviteLinkApi,
    ownerMessenger: options.ownerMessenger ?? (options.botToken === null ? undefined : messenger),
    ...(options.contentFetch === undefined ? {} : { contentFetch: options.contentFetch }),
    aiProvider: options.aiProvider ?? null
  };
  const app = createApp({
    ...overrides,
    ...(options.localSignIn === true ? { mountBeforeGuard: mountLocalSignIn } : {})
  });
  const background: Promise<unknown>[] = [];
  // Queue AI_JOBS: a sent job runs at once through the real consumer, as background work `settle()` waits for.
  // A test sends the same body twice through `redeliver` to check the single claim.
  const aiJobs = {
    sent: [] as unknown[],
    send(body: unknown) {
      aiJobs.sent.push(body);
      background.push(aiJobs.deliver(body));
      return Promise.resolve();
    },
    deliver(body: unknown) {
      const message = { id: crypto.randomUUID(), timestamp: new Date(), body, attempts: 1, ack() {}, retry() {} };
      const batch = { queue: 'content-ai-local', messages: [message], ackAll() {}, retryAll() {} };
      return handleAiQueue(
        batch as unknown as MessageBatch<unknown>,
        createContainer(env, overrides),
        env.TELEGRAM_BOT_TOKEN ?? ''
      );
    }
  };
  const env = {
    DB: options.db ?? testDb(),
    OWNER_TELEGRAM_ID: options.ownerTelegramId ?? OWNER_ID,
    ...(options.publishingEnabled === undefined ? {} : { PUBLISHING_ENABLED: options.publishingEnabled }),
    ...(options.botInfo === undefined ? {} : { BOT_INFO: options.botInfo }),
    ...(options.webhookSecret === undefined ? {} : { TELEGRAM_WEBHOOK_SECRET: options.webhookSecret }),
    MEDIA_BUCKET: testMediaBucket(),
    ...(options.botToken === null ? {} : { TELEGRAM_BOT_TOKEN: options.botToken ?? TEST_BOT_TOKEN }),
    AI_JOBS: aiJobs,
    ...options.env
  } as AppEnv;
  const executionCtx = {
    waitUntil: (work: Promise<unknown>) => {
      background.push(work);
    },
    passThroughOnException: () => {}
  };
  return {
    clock,
    background,
    aiJobs,
    ownerMessages: messenger.sent,
    async settle() {
      await Promise.allSettled(background);
    },
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

/** Opens /post mode in the owner's chat, so the bot turns texts and files into drafts (owner, 16.10.2026). */
export async function openPostMode(chatId = Number(OWNER_ID)): Promise<void> {
  await testDb()
    .prepare(
      `INSERT OR REPLACE INTO ai_writer_requests (chat_id, format, prompt_message_id, expires_at, updated_at, history, kind)
       VALUES (?, NULL, 1, 9000000000000000, 0, '[]', 'post')`
    )
    .bind(chatId)
    .run();
}
