import {
  exchangeTikTokCode,
  fetchTikTokAccount,
  refreshTikTokTokens,
  revokeTikTokToken,
  TikTokApiError,
  tiktokAuthorizeUrl
} from '../../integrations/tiktok/tiktok-api';
import type { Clock } from '../../platform/clock';
import type { Logger } from '../../platform/logging/logger';
import { createTokenCipher } from '../../platform/security/token-cipher';
import { randomToken, TOKEN_PATTERN } from '../../platform/security/random-token';
import { sha256Hex } from '../../platform/security/sha256';
import { timingSafeEqualStrings } from '../../platform/security/timing-safe-equal';
import { ContentCollectError } from './types';

const STATE_TTL_MS = 10 * 60 * 1000;
/** An access token this close to expiry is refreshed before use (TikTok issues 24-hour tokens). */
const REFRESH_AHEAD_MS = 10 * 60 * 1000;
const CIPHER_PURPOSE = 'content-bot/tiktok-tokens/v1';

export interface TikTokConfig {
  clientKey: string;
  clientSecret: string;
}

export interface TikTokConnectionRow {
  accountId: string;
  accountName: string | null;
  scope: string;
  accessTokenEnc: string;
  accessExpiresAt: number;
  refreshTokenEnc: string;
  refreshExpiresAt: number;
  connectedAt: number;
}

export interface TikTokConnectionRepository {
  createState(input: { stateHash: string; now: number; expiresAt: number }): Promise<void>;
  /** Marks a state used; true only once, and only before it expires. */
  consumeState(input: { stateHash: string; now: number }): Promise<boolean>;
  load(): Promise<TikTokConnectionRow | null>;
  save(row: TikTokConnectionRow & { now: number }): Promise<void>;
  /**
   * Replaces the tokens of the connection that is still the one read (same refresh token): a disconnect or a
   * reconnect that happened meanwhile wins, and the refreshed tokens are dropped. True when it was written.
   */
  replaceTokens(input: TikTokConnectionRow & { now: number; previousRefreshTokenEnc: string }): Promise<boolean>;
  remove(): Promise<void>;
}

export function createD1TikTokConnectionRepository(db: D1Database): TikTokConnectionRepository {
  return {
    async createState({ stateHash, now, expiresAt }) {
      // Expired states are cleared on the way: at most a handful exist at any time.
      await db.batch([
        db.prepare("DELETE FROM content_oauth_states WHERE platform = 'tiktok' AND expires_at < ?").bind(now),
        db
          .prepare(
            "INSERT INTO content_oauth_states (state_hash, platform, created_at, expires_at) VALUES (?, 'tiktok', ?, ?)"
          )
          .bind(stateHash, now, expiresAt)
      ]);
    },
    async consumeState({ stateHash, now }) {
      const result = await db
        .prepare(
          `UPDATE content_oauth_states SET used_at = ?1
           WHERE state_hash = ?2 AND platform = 'tiktok' AND used_at IS NULL AND expires_at > ?1`
        )
        .bind(now, stateHash)
        .run();
      return result.meta.changes === 1;
    },
    async load() {
      const row = await db
        .prepare(
          `SELECT account_id AS accountId, account_name AS accountName, scope, access_token_enc AS accessTokenEnc,
                  access_expires_at AS accessExpiresAt, refresh_token_enc AS refreshTokenEnc,
                  refresh_expires_at AS refreshExpiresAt, connected_at AS connectedAt
           FROM content_connections WHERE platform = 'tiktok'`
        )
        .first<TikTokConnectionRow>();
      return row ?? null;
    },
    async save(row) {
      await db
        .prepare(
          `INSERT INTO content_connections (platform, account_id, account_name, scope, access_token_enc,
             access_expires_at, refresh_token_enc, refresh_expires_at, connected_at, updated_at)
           VALUES ('tiktok', ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (platform) DO UPDATE SET account_id = excluded.account_id, account_name = excluded.account_name,
             scope = excluded.scope, access_token_enc = excluded.access_token_enc,
             access_expires_at = excluded.access_expires_at, refresh_token_enc = excluded.refresh_token_enc,
             refresh_expires_at = excluded.refresh_expires_at, connected_at = excluded.connected_at,
             updated_at = excluded.updated_at`
        )
        .bind(
          row.accountId,
          row.accountName,
          row.scope.slice(0, 500),
          row.accessTokenEnc,
          row.accessExpiresAt,
          row.refreshTokenEnc,
          row.refreshExpiresAt,
          row.connectedAt,
          row.now
        )
        .run();
    },
    async replaceTokens(row) {
      const result = await db
        .prepare(
          `UPDATE content_connections SET account_id = ?, scope = ?, access_token_enc = ?, access_expires_at = ?,
             refresh_token_enc = ?, refresh_expires_at = ?, updated_at = ?
           WHERE platform = 'tiktok' AND refresh_token_enc = ?`
        )
        .bind(
          row.accountId,
          row.scope.slice(0, 500),
          row.accessTokenEnc,
          row.accessExpiresAt,
          row.refreshTokenEnc,
          row.refreshExpiresAt,
          row.now,
          row.previousRefreshTokenEnc
        )
        .run();
      return result.meta.changes === 1;
    },
    async remove() {
      await db.prepare("DELETE FROM content_connections WHERE platform = 'tiktok'").run();
    }
  };
}

export type ConnectResult = 'connected' | 'denied' | 'expired' | 'failed';

export interface TikTokDeps {
  repo: TikTokConnectionRepository;
  config: TikTokConfig;
  clock: Clock;
  fetchImpl?: typeof fetch;
}

export const TIKTOK_STATE_TTL_SEC = STATE_TTL_MS / 1000;

/**
 * Starts a connection: a single-use state stored on this server and TikTok's consent URL. The caller also
 * puts the state in a cookie of the owner's browser, so only that browser can finish the connection.
 */
export async function startTikTokConnect(
  deps: TikTokDeps,
  redirectUri: string
): Promise<{ authorizeUrl: string; state: string }> {
  const state = randomToken();
  const now = deps.clock.now();
  await deps.repo.createState({ stateHash: await sha256Hex(state), now, expiresAt: now + STATE_TTL_MS });
  return { authorizeUrl: tiktokAuthorizeUrl({ clientKey: deps.config.clientKey, redirectUri, state }), state };
}

// TikTok's redirect back. Nothing in the query is trusted until the state is consumed: an unknown,
// reused or expired state ends here without calling TikTok.
export async function completeTikTokConnect(
  deps: TikTokDeps & { logger: Logger; requestId: string },
  input: {
    state: string | undefined;
    /** The state cookie of the browser that started the connection. */
    browserState: string | undefined;
    code: string | undefined;
    error: string | undefined;
    redirectUri: string;
  }
): Promise<ConnectResult> {
  if (input.state === undefined || !TOKEN_PATTERN.test(input.state)) return 'expired';
  // A leaked consent link opened in another browser cannot link someone else's TikTok account.
  if (input.browserState === undefined || !timingSafeEqualStrings(input.state, input.browserState)) return 'expired';
  const consumed = await deps.repo.consumeState({ stateHash: await sha256Hex(input.state), now: deps.clock.now() });
  if (!consumed) return 'expired';
  if (input.error !== undefined || input.code === undefined) return 'denied';
  try {
    const tokens = await exchangeTikTokCode(
      {
        clientKey: deps.config.clientKey,
        clientSecret: deps.config.clientSecret,
        code: input.code,
        redirectUri: input.redirectUri,
        now: deps.clock.now()
      },
      deps.fetchImpl
    );
    const account = await fetchTikTokAccount(tokens.accessToken, deps.fetchImpl);
    const cipher = createTokenCipher(deps.config.clientSecret, CIPHER_PURPOSE);
    const now = deps.clock.now();
    await deps.repo.save({
      accountId: tokens.openId,
      accountName: account.username ?? account.displayName,
      scope: tokens.scope,
      accessTokenEnc: await cipher.encrypt(tokens.accessToken),
      accessExpiresAt: tokens.accessExpiresAt,
      refreshTokenEnc: await cipher.encrypt(tokens.refreshToken),
      refreshExpiresAt: tokens.refreshExpiresAt,
      connectedAt: now,
      now
    });
    deps.logger.info({
      requestId: deps.requestId,
      component: 'content-analytics',
      operation: 'tiktok_connect',
      status: 'ok'
    });
    return 'connected';
  } catch (error) {
    deps.logger.warn({
      requestId: deps.requestId,
      component: 'content-analytics',
      operation: 'tiktok_connect',
      status: 'error',
      errorCode: error instanceof TikTokApiError ? error.code : error instanceof Error ? error.name : 'UNKNOWN'
    });
    return 'failed';
  }
}

/** A usable access token, refreshed when it is about to expire; the rotated refresh token is stored. */
export async function tiktokAccessToken(
  deps: TikTokDeps
): Promise<{ accessToken: string; accountName: string | null }> {
  const row = await deps.repo.load();
  if (row === null) throw new ContentCollectError('TIKTOK_NOT_CONNECTED');
  const cipher = createTokenCipher(deps.config.clientSecret, CIPHER_PURPOSE);
  const now = deps.clock.now();
  if (row.accessExpiresAt - REFRESH_AHEAD_MS > now) {
    const accessToken = await cipher.decrypt(row.accessTokenEnc);
    if (accessToken === null) throw new ContentCollectError('TIKTOK_RECONNECT');
    return { accessToken, accountName: row.accountName };
  }
  if (row.refreshExpiresAt <= now) throw new ContentCollectError('TIKTOK_RECONNECT');
  const refreshToken = await cipher.decrypt(row.refreshTokenEnc);
  if (refreshToken === null) throw new ContentCollectError('TIKTOK_RECONNECT');
  let tokens;
  try {
    tokens = await refreshTikTokTokens(
      { clientKey: deps.config.clientKey, clientSecret: deps.config.clientSecret, refreshToken, now },
      deps.fetchImpl
    );
  } catch (error) {
    if (error instanceof TikTokApiError) {
      throw new ContentCollectError(error.code === 'TIKTOK_AUTH' ? 'TIKTOK_RECONNECT' : error.code);
    }
    throw error;
  }
  const stored = await deps.repo.replaceTokens({
    ...row,
    accountId: tokens.openId,
    scope: tokens.scope,
    accessTokenEnc: await cipher.encrypt(tokens.accessToken),
    accessExpiresAt: tokens.accessExpiresAt,
    refreshTokenEnc: await cipher.encrypt(tokens.refreshToken),
    refreshExpiresAt: tokens.refreshExpiresAt,
    now: deps.clock.now(),
    previousRefreshTokenEnc: row.refreshTokenEnc
  });
  // Disconnected or reconnected while refreshing: this run must not use or resurrect the old grant.
  if (!stored) throw new ContentCollectError('TIKTOK_NOT_CONNECTED');
  return { accessToken: tokens.accessToken, accountName: row.accountName };
}

/** Forgets the connection; revoking at TikTok is best effort and never keeps the tokens around. */
export async function disconnectTikTok(deps: TikTokDeps & { logger: Logger; requestId: string }): Promise<void> {
  const row = await deps.repo.load();
  if (row === null) return;
  const cipher = createTokenCipher(deps.config.clientSecret, CIPHER_PURPOSE);
  const now = deps.clock.now();
  await deps.repo.remove();
  try {
    // An expired access token cannot revoke the grant: get a fresh one with the refresh token first.
    let accessToken = await cipher.decrypt(row.accessTokenEnc);
    if (accessToken === null || row.accessExpiresAt <= now) {
      const refreshToken = row.refreshExpiresAt > now ? await cipher.decrypt(row.refreshTokenEnc) : null;
      if (refreshToken === null) return;
      accessToken = (
        await refreshTikTokTokens(
          { clientKey: deps.config.clientKey, clientSecret: deps.config.clientSecret, refreshToken, now },
          deps.fetchImpl
        )
      ).accessToken;
    }
    await revokeTikTokToken(
      { clientKey: deps.config.clientKey, clientSecret: deps.config.clientSecret, accessToken },
      deps.fetchImpl
    );
  } catch (error) {
    deps.logger.warn({
      requestId: deps.requestId,
      component: 'content-analytics',
      operation: 'tiktok_revoke',
      status: 'error',
      errorCode: error instanceof TikTokApiError ? error.code : 'UNKNOWN'
    });
  }
}
