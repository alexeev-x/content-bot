import { sha256Hex } from '../../../platform/security/sha256';
import { AppError } from '../../../shared/app-error';
import { issueBrowserSession, type IssueBrowserSessionDeps } from './issue-browser-session';
import { parseOwnerTelegramId } from './owner';
import type { IssuedBrowserTokens } from './refresh-session';

export interface LocalSignInDeps extends IssueBrowserSessionDeps {
  /** `OWNER_TELEGRAM_ID`; the session belongs to this user, so the rest of the API sees the real owner. */
  ownerTelegramId: string | undefined;
}

const LOCAL_SESSION_NAME = 'Локальная разработка';

// Owner session without Telegram, for `npm run dev` only: the Login Widget refuses localhost. The caller
// (app/local-sign-in-route.ts) decides whether this may run at all; this use case only issues the session.
export async function signInLocally(deps: LocalSignInDeps): Promise<IssuedBrowserTokens> {
  const owner = parseOwnerTelegramId(deps.ownerTelegramId);
  if (owner === null) throw new AppError('UNAVAILABLE', 'Owner is not configured');
  // No signature to consume: a fresh random key keeps the one-time claim satisfied.
  const issued = await issueBrowserSession(deps, {
    telegramId: String(owner),
    name: LOCAL_SESSION_NAME,
    signInKey: await sha256Hex(deps.newToken())
  });
  if (issued === null) throw new AppError('UNAVAILABLE', 'Local sign-in failed');
  return issued;
}
