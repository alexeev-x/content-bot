import { sha256Hex } from '../../../platform/security/sha256';
import { AppError } from '../../../shared/app-error';
import { displayName } from './display-name';
import { parseOwnerTelegramId } from './owner';
import type { SessionStore } from './ports';
import { ACCESS_TOKEN_TTL_MS, MINIAPP_SESSION_MAX_MS } from './session-policy';
import { verifyInitData } from './verify-init-data';

export interface SignInDeps {
  sessions: SessionStore;
  /** `TELEGRAM_BOT_TOKEN`; the sign-in cannot work without it. */
  botToken: string | undefined;
  /** `OWNER_TELEGRAM_ID`; empty or unset means nobody can sign in. */
  ownerTelegramId: string | undefined;
  now: number;
  newId: () => string;
  newToken: () => string;
}

export interface IssuedAccessToken {
  accessToken: string;
  /** UTC epoch milliseconds. */
  expiresAt: number;
}

// One signature failure never tells the caller which check failed.
export async function signInWithTelegram(deps: SignInDeps, initData: string): Promise<IssuedAccessToken> {
  if (deps.botToken === undefined || deps.botToken === '') {
    throw new AppError('UNAVAILABLE', 'Sign-in is not configured');
  }
  // Telegram user ids are positive, so 0 matches nobody: with no owner a valid signature ends in
  // 403 and a forged one still in 401.
  const ownerTelegramId = parseOwnerTelegramId(deps.ownerTelegramId) ?? 0;

  const result = await verifyInitData({ initData, botToken: deps.botToken, ownerTelegramId, now: deps.now });
  if (!result.ok) {
    if (result.reason === 'FOREIGN_USER') throw new AppError('FORBIDDEN', 'Access denied');
    throw new AppError('UNAUTHORIZED', 'Invalid Telegram sign-in data');
  }

  const accessToken = deps.newToken();
  const hardExpiresAt = deps.now + MINIAPP_SESSION_MAX_MS;
  const expiresAt = Math.min(deps.now + ACCESS_TOKEN_TTL_MS, hardExpiresAt);
  await deps.sessions.create({
    id: deps.newId(),
    tokenHash: await sha256Hex(accessToken),
    telegramId: String(result.user.id),
    kind: 'miniapp',
    name: displayName(result.user),
    createdAt: deps.now,
    expiresAt,
    hardExpiresAt
  });
  return { accessToken, expiresAt };
}
