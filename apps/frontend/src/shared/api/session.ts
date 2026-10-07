import type { AccessTokenDto } from '@alexeev/contracts';

// The access token lives in memory only: never localStorage/sessionStorage (a page reload signs in again).
let session: AccessTokenDto | null = null;
// Lifetime is measured from receipt on the monotonic clock, so a skewed device clock cannot break renewal.
let receivedAt = 0;
let ttlMs = 0;
let renewable = true;
/** Access-token lifetime per docs/FRONTEND_ARCHITECTURE.md §6, used when the server time is unknown. */
export const ACCESS_TOKEN_TTL_MS = 60 * 60_000;
// Bumped on every change: lets in-flight work tell whether the session it started from is still current.
let generation = 0;
const listeners = new Set<() => void>();
const SESSION_HINT_KEY = 'alexeev.has-session';

function writeSessionHint(present: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (present) window.localStorage.setItem(SESSION_HINT_KEY, '1');
    else window.localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    // Storage can be unavailable (privacy mode, embedded contexts). Auth still works from the HttpOnly cookie.
  }
}

/**
 * Non-sensitive UX hint only. It never grants access and never contains credentials.
 * The server still decides whether the HttpOnly refresh cookie represents a valid session.
 */
export function hasSessionHint(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SESSION_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function getAccessToken(): string | null {
  return session?.accessToken ?? null;
}

export function getSessionExpiresAt(): string | null {
  return session?.expiresAt ?? null;
}

export function getSessionGeneration(): number {
  return generation;
}

export type SetSessionOptions = {
  /** Server clock (ms) from the response `Date` header: expiresAt is measured against it, not the device clock. */
  serverTime?: number | undefined;
  /** False when the server did not extend the session (hard end reached): no further renewal. */
  renewable?: boolean;
};

/** Milliseconds of access-token lifetime left, from receipt; null without a session. */
export function getRemainingLifetimeMs(): number | null {
  if (session === null) return null;
  return ttlMs - (performance.now() - receivedAt);
}

export function isSessionRenewable(): boolean {
  return session !== null && renewable;
}

export function setSession(next: AccessTokenDto, options: SetSessionOptions = {}): void {
  generation += 1;
  const fromServer = options.serverTime === undefined ? Number.NaN : Date.parse(next.expiresAt) - options.serverTime;
  ttlMs = Number.isNaN(fromServer) ? ACCESS_TOKEN_TTL_MS : Math.max(0, fromServer);
  receivedAt = performance.now();
  renewable = options.renewable ?? true;
  session = { accessToken: next.accessToken, expiresAt: next.expiresAt };
  writeSessionHint(true);
  notify();
}

/** Logout and failed re-authentication both end here. */
export function clearSession(): void {
  writeSessionHint(false);
  if (session === null) return;
  session = null;
  generation += 1;
  notify();
}

/** Lets the app react (e.g. route to sign-in) when the session is set or cleared. */
export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
