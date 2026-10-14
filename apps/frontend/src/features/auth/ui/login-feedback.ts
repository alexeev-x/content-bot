import { ApiError } from '../../../shared/api/http-client';

export type LoginProblem =
  | { kind: 'cancelled' }
  /** Telegram handed back something the sign-in contract does not accept; nothing was sent. */
  | { kind: 'invalid' }
  /** 401: bad, stale (> 15 min) or already used signature. */
  | { kind: 'expired' }
  /** 403: signed in as someone who is not the owner. */
  | { kind: 'forbidden' }
  /** 429 with the server's Retry-After, when it sent one. */
  | { kind: 'rateLimit'; retryAfterSeconds: number | undefined }
  /** 503 and network failures. */
  | { kind: 'unavailable' };

export function problemFromError(error: unknown): LoginProblem {
  if (error instanceof ApiError) {
    if (error.status === 401) return { kind: 'expired' };
    if (error.status === 403) return { kind: 'forbidden' };
    if (error.status === 429) return { kind: 'rateLimit', retryAfterSeconds: error.retryAfterSeconds };
    if (error.status === 400 || error.status === 413 || error.status === 422) return { kind: 'invalid' };
  }
  return { kind: 'unavailable' };
}

/** Wait shown for a 429 without a usable Retry-After, and the cap for an absurd one. */
const DEFAULT_RETRY_SECONDS = 30;
const MAX_RETRY_SECONDS = 15 * 60;

export function retryWait(seconds: number | undefined): number {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return DEFAULT_RETRY_SECONDS;
  return Math.min(Math.ceil(seconds), MAX_RETRY_SECONDS);
}
