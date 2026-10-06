import { TOKEN_PATTERN } from '../../../platform/security/random-token';
import { sha256Hex } from '../../../platform/security/sha256';
import { AppError } from '../../../shared/app-error';
import { authenticateOwner } from './authenticate-owner';
import { isOwner } from './owner';
import type { SessionStore } from './ports';

export interface LogoutDeps {
  sessions: SessionStore;
  ownerTelegramId: string | undefined;
  now: number;
}

// Ends the session named by the Bearer token and/or the refresh cookie. Either one is enough, so a
// browser whose access token has expired can still sign out with the cookie alone.
export async function logout(
  deps: LogoutDeps,
  credentials: { authorization: string | undefined; refreshToken: string | undefined }
): Promise<void> {
  const sessionIds = new Set<string>();
  let failure: AppError | null = null;

  if (credentials.authorization !== undefined) {
    try {
      sessionIds.add((await authenticateOwner(deps, credentials.authorization)).session.id);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      failure = error;
    }
  }

  const { refreshToken } = credentials;
  if (refreshToken !== undefined && TOKEN_PATTERN.test(refreshToken)) {
    const record = await deps.sessions.findRefreshToken(await sha256Hex(refreshToken));
    if (record !== null && record.sessionRevokedAt === null) {
      if (isOwner(record.telegramId, deps.ownerTelegramId)) sessionIds.add(record.sessionId);
      else failure = new AppError('FORBIDDEN', 'Access denied');
    }
  }

  if (sessionIds.size === 0) throw failure ?? new AppError('UNAUTHORIZED', 'Authentication required');
  await deps.sessions.revoke([...sessionIds], deps.now);
}
