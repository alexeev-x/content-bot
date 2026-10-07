import type { AccessTokenDto } from '@alexeev/contracts';
import type { Hono } from 'hono';
import { signInLocally } from '../modules/identity';
import { AppError } from '../shared/app-error';
import type { AppBindings } from './env';
import { setRefreshCookie } from './refresh-cookie';
import { requireAppOrigin } from './require-app-origin';

export const LOCAL_SIGN_IN_PATH = '/api/v1/auth/local';

// Owner session without Telegram on `npm run dev`, because the Login Widget refuses localhost (docs/LOCAL_PREVIEW.md).
// Only src/index.ts mounts it, behind the `__LOCAL_SIGN_IN__` build constant, so `vite build` drops this module
// from the Worker bundle. Registered before the session guard: it is how a session starts.
export function mountLocalSignIn(app: Hono<AppBindings>): void {
  app.post(LOCAL_SIGN_IN_PATH, requireAppOrigin, async (c) => {
    // Second lock: answers only on the developer's machine. Cloudflare routes by host, so a deployed Worker
    // never sees these names.
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(c.req.url).hostname)) {
      throw new AppError('NOT_FOUND', 'Unknown route');
    }
    const container = c.get('container');
    const now = container.clock.now();
    const issued = await signInLocally({
      sessions: container.sessions,
      ownerTelegramId: c.env.OWNER_TELEGRAM_ID,
      now,
      newId: container.newId,
      newToken: container.newToken
    });
    setRefreshCookie(c, issued.refreshToken, Math.floor((issued.refreshExpiresAt - now) / 1000));
    const body: AccessTokenDto = {
      accessToken: issued.accessToken,
      expiresAt: new Date(issued.expiresAt).toISOString()
    };
    return c.json(body);
  });
}
