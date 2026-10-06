import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppBindings } from './env';

const NAME = 'refresh_token';
// Only the auth endpoints ever receive it; the main API never reads cookies.
const PATH = '/api/v1/auth';

export function readRefreshCookie(c: Context<AppBindings>): string | undefined {
  return getCookie(c, NAME);
}

export function setRefreshCookie(c: Context<AppBindings>, token: string, maxAgeSec: number): void {
  setCookie(c, NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: PATH,
    maxAge: maxAgeSec
  });
}

export function clearRefreshCookie(c: Context<AppBindings>): void {
  deleteCookie(c, NAME, { path: PATH, secure: true });
}
