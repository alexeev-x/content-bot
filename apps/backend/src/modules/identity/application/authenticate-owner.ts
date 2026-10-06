import { sha256Hex } from '../../../platform/security/sha256';
import { AppError } from '../../../shared/app-error';
import { isOwner } from './owner';
import type { ActiveSession, SessionStore } from './ports';

export interface AuthenticatedActor {
  telegramId: string;
  session: ActiveSession;
}

export interface AuthenticateDeps {
  sessions: SessionStore;
  /** `OWNER_TELEGRAM_ID`; empty or unset means nobody is allowed. */
  ownerTelegramId: string | undefined;
  now: number;
}

// Bounded so a hostile header cannot make us hash megabytes.
const BEARER = /^Bearer ([^\s]{1,512})$/i;

// Fails closed: no token or an unknown/expired/revoked one is 401; a real session of anyone but
// the owner is 403, and so is every session when the owner is not configured.
export async function authenticateOwner(
  deps: AuthenticateDeps,
  authorization: string | undefined
): Promise<AuthenticatedActor> {
  const token = authorization === undefined ? undefined : BEARER.exec(authorization)?.[1];
  if (token === undefined) throw new AppError('UNAUTHORIZED', 'Authentication required');

  // Lookup by hash: the DB never sees the token, and the comparison happens on a unique index.
  const session = await deps.sessions.findActiveByTokenHash(await sha256Hex(token), deps.now);
  if (session === null) throw new AppError('UNAUTHORIZED', 'Authentication required');

  if (!isOwner(session.telegramId, deps.ownerTelegramId)) throw new AppError('FORBIDDEN', 'Access denied');
  return { telegramId: session.telegramId, session };
}
