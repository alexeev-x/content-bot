import { accessTokenSchema, apiErrorSchema, type AccessTokenDto, type ApiErrorCode } from '@alexeev/contracts';
import type { ZodType } from 'zod';
import {
  clearSession,
  getAccessToken,
  getRemainingLifetimeMs,
  getSessionExpiresAt,
  getSessionGeneration,
  isSessionRenewable,
  setSession,
  subscribeSession
} from './session';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly requestId: string | undefined;
  readonly details: Record<string, string> | undefined;
  /** Seconds to wait before retrying; only set from a `Retry-After` header (429/503). */
  readonly retryAfterSeconds: number | undefined;

  constructor(init: {
    code: ApiErrorCode;
    status: number;
    message: string;
    requestId?: string | undefined;
    details?: Record<string, string> | undefined;
    retryAfterSeconds?: number | undefined;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.code = init.code;
    this.status = init.status;
    this.requestId = init.requestId;
    this.details = init.details;
    this.retryAfterSeconds = init.retryAfterSeconds;
  }

  /** `details.reason` of the contract error, e.g. STALE_REVISION. */
  get reason(): string | undefined {
    return this.details?.['reason'];
  }
}

function codeFromStatus(status: number): ApiErrorCode {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 422 || status === 400 || status === 413) return 'VALIDATION_ERROR';
  if (status === 429) return 'RATE_LIMIT';
  return 'UNAVAILABLE';
}

export function parseRetryAfter(value: string | null, now: number = Date.now()): number | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - now) / 1000));
}

/** Maps a non-2xx response to a typed error; uses the contract error body when present. */
export async function mapApiError(response: Response): Promise<ApiError> {
  const retryAfterSeconds = parseRetryAfter(response.headers.get('Retry-After'));
  try {
    const parsed = apiErrorSchema.safeParse(await response.json());
    if (parsed.success) {
      const { code, message, requestId, details } = parsed.data.error;
      return new ApiError({ code, message, requestId, details, status: response.status, retryAfterSeconds });
    }
  } catch {
    // body is not JSON: fall back to the status
  }
  return new ApiError({
    code: codeFromStatus(response.status),
    status: response.status,
    message: `HTTP ${response.status}`,
    requestId: response.headers.get('x-request-id') ?? undefined,
    retryAfterSeconds
  });
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal | undefined;
  headers?: Record<string, string>;
  /** Sign-in endpoints: no Bearer and no silent re-auth. */
  anonymous?: boolean;
  /** Refresh and logout: send the Bearer but never re-authenticate. */
  skipReauth?: boolean;
};

async function send(path: string, options: RequestOptions, token: string | null): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (token && !options.anonymous) headers['Authorization'] = `Bearer ${token}`;
  const init: RequestInit = { method: options.method ?? 'GET', headers };
  // The refresh cookie travels only on /auth/* (its cookie path).
  if (path.startsWith('/api/v1/auth/')) init.credentials = 'include';
  if (options.signal) init.signal = options.signal;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  try {
    return await fetch(new URL(path, window.location.origin), init);
  } catch (cause) {
    if (options.signal?.aborted) throw cause;
    throw new ApiError({ code: 'UNAVAILABLE', status: 0, message: 'Network error' });
  }
}

// Single-flight: a parallel refresh with an already rotated cookie revokes the whole session.
let refreshInFlight: Promise<AccessTokenDto> | null = null;
let refreshAbort: AbortController | null = null;
// Bumped by logout: a refresh that started earlier must not install its result.
let refreshEpoch = 0;
// Session generation whose refresh was refused (401/403): later 401s of that generation do not retry it.
let refusedGeneration: number | null = null;

const isAuthRefusal = (error: unknown): boolean =>
  error instanceof ApiError && (error.status === 401 || error.status === 403);

function abortedError(): DOMException {
  return new DOMException('Refresh aborted', 'AbortError');
}

const REFRESH_TIMEOUT_MS = 15_000;

function currentSessionOrAborted(): AccessTokenDto {
  const token = getAccessToken();
  const expiresAt = getSessionExpiresAt();
  if (token !== null && expiresAt !== null) return { accessToken: token, expiresAt };
  throw abortedError();
}

async function performRefresh(startGeneration: number, startEpoch: number): Promise<AccessTokenDto> {
  // The task may have waited for the Web Lock: logout or sign-in can have happened meanwhile.
  if (startEpoch !== refreshEpoch) throw abortedError();
  if (startGeneration !== getSessionGeneration()) return currentSessionOrAborted();
  const controller = new AbortController();
  refreshAbort = controller;
  // A hung request must not hold the cross-tab lock; a timeout is a transient failure.
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REFRESH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await send(
      '/api/v1/auth/refresh',
      { method: 'POST', skipReauth: true, signal: controller.signal },
      getAccessToken()
    );
  } catch (error) {
    if (timedOut) throw new ApiError({ code: 'UNAVAILABLE', status: 0, message: 'Refresh timed out' });
    throw error;
  } finally {
    clearTimeout(timer);
  }
  if (startEpoch !== refreshEpoch) throw abortedError();
  // A newer session (sign-in meanwhile) must survive a stale refresh, whatever its outcome.
  const stillCurrent = getSessionGeneration() === startGeneration;
  if (!response.ok) {
    const error = await mapApiError(response);
    if (stillCurrent && isAuthRefusal(error)) {
      refusedGeneration = startGeneration;
      clearSession();
    }
    throw error;
  }
  const parsed = accessTokenSchema.safeParse(await response.json().catch(() => undefined));
  if (startEpoch !== refreshEpoch) throw abortedError();
  if (!parsed.success) {
    throw new ApiError({ code: 'UNAVAILABLE', status: response.status, message: 'Unexpected response shape' });
  }
  if (!stillCurrent) return currentSessionOrAborted();
  // A refresh that does not push expiresAt forward means the session hit its hard end: renew no more.
  const previous = getSessionExpiresAt();
  const extended = previous === null || Date.parse(parsed.data.expiresAt) > Date.parse(previous);
  const serverDate = Date.parse(response.headers.get('Date') ?? '');
  setSession(parsed.data, {
    serverTime: Number.isNaN(serverDate) ? undefined : serverDate,
    renewable: extended
  });
  return parsed.data;
}

// Browser tabs share one rotating refresh cookie, so two tabs refreshing at once look like cookie reuse and
// the server revokes the session. A Web Lock serialises them; the later tab then sends the cookie the first
// one just rotated. Without the API (old browsers, tests) behaviour is per-tab single-flight only.
function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  return locks ? locks.request('alexeev-refresh', task) : task();
}

/** Renews the access token; concurrent callers share one request. A 401/403 ends the session. */
export function refreshSession(): Promise<AccessTokenDto> {
  if (refreshInFlight !== null) return refreshInFlight;
  // Captured before queueing for the lock, so a logout or sign-in while queued is noticed.
  const generation = getSessionGeneration();
  const epoch = refreshEpoch;
  const promise: Promise<AccessTokenDto> = withRefreshLock(() => performRefresh(generation, epoch)).finally(() => {
    if (refreshInFlight === promise) {
      refreshInFlight = null;
      refreshAbort = null;
    }
  });
  refreshInFlight = promise;
  return promise;
}

/** Logout: drop any in-flight refresh and renewal so neither can bring the session back. */
export function cancelSessionRenewal(): void {
  refreshEpoch += 1;
  refreshAbort?.abort();
  refreshAbort = null;
  refreshInFlight = null;
  clearRenewalTimer();
}

// Proactive renewal. The Mini App refresh needs a still-valid Bearer, so waiting for a 401 would end the
// session every hour. One timer, rescheduled on every session change (clear cancels it).
const RENEW_LEAD_MS = 5 * 60_000;
const RENEW_JITTER_MS = 30_000;
// Floor on every renewal delay and on the lifetime worth renewing: the backend limits refreshes per client.
const RENEW_MIN_DELAY_MS = 60_000;
const MAX_RENEW_RETRIES = 3;
let renewalTimer: ReturnType<typeof setTimeout> | null = null;
let renewRetries = 0;
let renewalDueAt = 0;
let lastRenewAttemptAt = Number.NEGATIVE_INFINITY;

function clearRenewalTimer(): void {
  if (renewalTimer !== null) clearTimeout(renewalTimer);
  renewalTimer = null;
}

function scheduleRenewal(delayMs?: number): void {
  clearRenewalTimer();
  const remaining = getRemainingLifetimeMs();
  // An expired or nearly expired token is left to the next 401; a session at its hard end is not renewed.
  if (remaining === null || remaining < RENEW_MIN_DELAY_MS || !isSessionRenewable()) return;
  const lead = Math.min(RENEW_LEAD_MS, remaining / 2);
  const delay = Math.max(
    RENEW_MIN_DELAY_MS,
    delayMs ?? remaining - lead - Math.random() * Math.min(RENEW_JITTER_MS, lead / 2)
  );
  if (delay >= remaining) return;
  renewalDueAt = performance.now() + delay;
  renewalTimer = setTimeout(renewNow, delay);
}

function renewNow(): void {
  renewalTimer = null;
  lastRenewAttemptAt = performance.now();
  refreshSession().catch((error: unknown) => {
    // 401/403 already cleared the session. A transient failure keeps the still-valid token and retries a
    // bounded number of times before expiry.
    if (isAuthRefusal(error) || error instanceof DOMException || renewRetries >= MAX_RENEW_RETRIES) return;
    renewRetries += 1;
    const wait = (error instanceof ApiError ? error.retryAfterSeconds : undefined) ?? 0;
    scheduleRenewal(wait * 1000);
  });
}

subscribeSession(() => {
  renewRetries = 0; // a new session gets a fresh retry budget and interval
  lastRenewAttemptAt = Number.NEGATIVE_INFINITY;
  scheduleRenewal();
});

// Timers may be frozen while the tab or Mini App is in the background: re-check on return. Same rules as the
// timer path: nothing while a renewal is in flight or its timer is still on schedule, the minimum interval
// between attempts, and the retry budget.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || refreshInFlight !== null) return;
    const remaining = getRemainingLifetimeMs();
    if (remaining === null || remaining < RENEW_MIN_DELAY_MS || remaining > RENEW_LEAD_MS || !isSessionRenewable())
      return;
    const now = performance.now();
    const timerOnSchedule = renewalTimer !== null && now < renewalDueAt;
    if (timerOnSchedule || renewRetries >= MAX_RENEW_RETRIES) return;
    if (now - lastRenewAttemptAt < RENEW_MIN_DELAY_MS) return;
    clearRenewalTimer();
    renewNow();
  });
}

async function execute(path: string, options: RequestOptions): Promise<Response> {
  const usedGeneration = getSessionGeneration();
  const first = await send(path, options, getAccessToken());
  if (first.status !== 401 || options.anonymous || options.skipReauth) return first;

  if (getSessionGeneration() !== usedGeneration) {
    // The session changed while this request was in flight: retry with a newer token, never refresh for a dead one.
    if (getAccessToken() === null) throw await mapApiError(first);
  } else if (refusedGeneration === usedGeneration) {
    throw await mapApiError(first);
  } else {
    try {
      await refreshSession();
    } catch (refreshError) {
      if (isAuthRefusal(refreshError)) throw await mapApiError(first);
      // Transient (429/503/network): the rejected token is dead, so drop it, and surface the refresh error.
      if (getSessionGeneration() === usedGeneration) clearSession();
      throw refreshError;
    }
  }
  const retried = await send(path, options, getAccessToken());
  if (retried.status === 401) clearSession();
  return retried;
}

export async function apiRequest<T>(path: string, schema: ZodType<T>, options: RequestOptions = {}): Promise<T> {
  const response = await execute(path, options);
  if (!response.ok) throw await mapApiError(response);
  const parsed = schema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) {
    throw new ApiError({ code: 'UNAVAILABLE', status: response.status, message: 'Unexpected response shape' });
  }
  return parsed.data;
}

/** Authenticated binary response. The caller owns the Blob and must keep it out of query/local storage. */
export async function apiRequestBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
  const response = await execute(path, options);
  if (!response.ok) throw await mapApiError(response);
  return response.blob();
}

/** For 204 endpoints (logout). */
export async function apiRequestNoContent(path: string, options: RequestOptions = {}): Promise<void> {
  const response = await execute(path, options);
  if (!response.ok) throw await mapApiError(response);
}
