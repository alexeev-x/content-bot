import { sha256Hex } from '../../../platform/security/sha256';
import { AppError } from '../../../shared/app-error';
import { displayName } from './display-name';
import { issueBrowserSession } from './issue-browser-session';
import { parseOwnerTelegramId } from './owner';
import type { SessionStore } from './ports';
import type { IssuedBrowserTokens } from './refresh-session';
import { verifyWidgetData, type WidgetField } from './verify-widget-data';

export interface WidgetSignInDeps {
  sessions: SessionStore;
  /** `TELEGRAM_BOT_TOKEN`; the sign-in cannot work without it. */
  botToken: string | undefined;
  /** `OWNER_TELEGRAM_ID`; empty or unset means nobody can sign in. */
  ownerTelegramId: string | undefined;
  now: number;
  newId: () => string;
  newToken: () => string;
}

// One failure message for a bad, stale or reused signature: the caller learns nothing about which.
const REJECTED = 'Invalid Telegram sign-in data';

// Creates a browser session from a Login Widget payload. The signature is checked first, then
// the session is issued with the signature as its one-time claim (see issueBrowserSession).
export async function signInWithWidget(
  deps: WidgetSignInDeps,
  fields: Readonly<Record<string, WidgetField>>
): Promise<IssuedBrowserTokens> {
  if (deps.botToken === undefined || deps.botToken === '') {
    throw new AppError('UNAVAILABLE', 'Sign-in is not configured');
  }
  // Telegram user ids are positive, so 0 matches nobody: with no owner a valid signature ends in
  // 403 and a forged one still in 401.
  const ownerTelegramId = parseOwnerTelegramId(deps.ownerTelegramId) ?? 0;

  const result = await verifyWidgetData({ fields, botToken: deps.botToken, ownerTelegramId, now: deps.now });
  if (!result.ok) {
    if (result.reason === 'FOREIGN_USER') throw new AppError('FORBIDDEN', 'Access denied');
    throw new AppError('UNAUTHORIZED', REJECTED);
  }

  const issued = await issueBrowserSession(deps, {
    telegramId: String(result.user.id),
    name: displayName(result.user),
    // The hash is a string here: verifyWidgetData accepted it as 64 hex characters.
    signInKey: await sha256Hex(String(fields.hash))
  });
  if (issued === null) throw new AppError('UNAUTHORIZED', REJECTED);
  return issued;
}
