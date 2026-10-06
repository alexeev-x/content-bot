import {
  type AccessTokenDto,
  type MeDto,
  telegramSignInInputSchema,
  telegramWidgetSignInInputSchema
} from '@alexeev/contracts';
import { Hono } from 'hono';
import {
  logout,
  refreshBrowserSession,
  refreshMiniAppSession,
  signInWithTelegram,
  signInWithWidget,
  type IssuedAccessToken
} from '../modules/identity';
import { AppError } from '../shared/app-error';
import type { AppBindings } from './env';
import { rateLimit } from './rate-limit';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './refresh-cookie';
import { requireAppOrigin } from './require-app-origin';
import { limitBody, validated } from './validation';

// Telegram caps initData well below this; the schema allows 4096 characters.
const MAX_SIGN_IN_BODY_BYTES = 16 * 1024;
// The widget object is a few short fields; the contract caps each at 256 characters and 16 fields.
const MAX_WIDGET_BODY_BYTES = 8 * 1024;
const WINDOW_MS = 10 * 60 * 1000;
const SIGN_IN_LIMIT = 10;
const REFRESH_LIMIT = 30;

function toDto(issued: IssuedAccessToken): AccessTokenDto {
  return { accessToken: issued.accessToken, expiresAt: new Date(issued.expiresAt).toISOString() };
}

// Mounted at /api/v1/auth. `telegram`, `telegram-widget`, `refresh` and `logout` are reachable without the Bearer
// guard (see create-app) because they authenticate themselves; `me` sits behind the guard.
export const authRoutes = new Hono<AppBindings>()
  .post(
    '/telegram',
    rateLimit({ name: 'auth-telegram', limit: SIGN_IN_LIMIT, windowMs: WINDOW_MS }),
    limitBody(MAX_SIGN_IN_BODY_BYTES),
    validated('json', telegramSignInInputSchema),
    async (c) => {
      const container = c.get('container');
      const issued = await signInWithTelegram(
        {
          sessions: container.sessions,
          botToken: c.env.TELEGRAM_BOT_TOKEN,
          ownerTelegramId: c.env.OWNER_TELEGRAM_ID,
          now: container.clock.now(),
          newId: container.newId,
          newToken: container.newToken
        },
        c.req.valid('json').initData
      );
      return c.json(toDto(issued));
    }
  )
  .post(
    '/telegram-widget',
    requireAppOrigin,
    // Shares the Mini App sign-in bucket: both are the same kind of attempt from the same client.
    rateLimit({ name: 'auth-telegram', limit: SIGN_IN_LIMIT, windowMs: WINDOW_MS }),
    limitBody(MAX_WIDGET_BODY_BYTES),
    validated('json', telegramWidgetSignInInputSchema),
    async (c) => {
      const container = c.get('container');
      const now = container.clock.now();
      const issued = await signInWithWidget(
        {
          sessions: container.sessions,
          botToken: c.env.TELEGRAM_BOT_TOKEN,
          ownerTelegramId: c.env.OWNER_TELEGRAM_ID,
          now,
          newId: container.newId,
          newToken: container.newToken
        },
        c.req.valid('json')
      );
      setRefreshCookie(c, issued.refreshToken, Math.floor((issued.refreshExpiresAt - now) / 1000));
      return c.json(toDto(issued));
    }
  )
  .post(
    '/refresh',
    requireAppOrigin,
    rateLimit({ name: 'auth-refresh', limit: REFRESH_LIMIT, windowMs: WINDOW_MS }),
    async (c) => {
      const container = c.get('container');
      const deps = {
        sessions: container.sessions,
        ownerTelegramId: c.env.OWNER_TELEGRAM_ID,
        now: container.clock.now(),
        newToken: container.newToken,
        logger: container.logger,
        requestId: c.get('requestId')
      };
      // The cookie decides: a browser may still hold an expired Bearer next to a good cookie.
      const refreshToken = readRefreshCookie(c);
      if (refreshToken === undefined) {
        return c.json(toDto(await refreshMiniAppSession(deps, c.req.header('authorization'))));
      }
      try {
        const issued = await refreshBrowserSession(deps, refreshToken);
        setRefreshCookie(c, issued.refreshToken, Math.floor((issued.refreshExpiresAt - deps.now) / 1000));
        return c.json(toDto(issued));
      } catch (error) {
        // A refused cookie is dead or stolen: drop it so the browser stops sending it.
        if (error instanceof AppError && error.code === 'UNAUTHORIZED') clearRefreshCookie(c);
        throw error;
      }
    }
  )
  .post('/logout', requireAppOrigin, async (c) => {
    const container = c.get('container');
    // The cookie goes away whatever the outcome: the client asked to leave.
    clearRefreshCookie(c);
    await logout(
      { sessions: container.sessions, ownerTelegramId: c.env.OWNER_TELEGRAM_ID, now: container.clock.now() },
      { authorization: c.req.header('authorization'), refreshToken: readRefreshCookie(c) }
    );
    return c.body(null, 204);
  })
  .get('/me', (c) => {
    const body: MeDto = { telegramId: c.get('actor').telegramId, name: c.get('actor').session.name };
    return c.json(body);
  });
