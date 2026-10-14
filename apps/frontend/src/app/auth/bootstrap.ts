import { refreshSession, signInLocally, signInWithMiniApp } from '../../features/auth';
import { ApiError } from '../../shared/api/http-client';
import { getAccessToken } from '../../shared/api/session';
import { isInsideTelegram } from '../../shared/telegram/web-app';

// True on `npm run dev` only (vite.config.ts); a build gets `false`, tests nothing.
declare const __LOCAL_SIGN_IN__: boolean | undefined;

export type BootResult =
  | { kind: 'done'; /** 401 from sign-in: the session could not be restored. */ error?: ApiError }
  | { kind: 'forbidden' }
  | { kind: 'unavailable'; error: unknown };

/**
 * One attempt to get a session at load: Mini App signs in with initData (non-empty initData, never the
 * User-Agent); a browser restores it from the refresh cookie with a single call.
 */
export async function bootstrapSession(): Promise<BootResult> {
  if (getAccessToken() !== null) return { kind: 'done' };
  try {
    if (isInsideTelegram()) await signInWithMiniApp();
    // `npm run dev`: a fresh owner session on every load, without the Telegram widget, which refuses localhost.
    // The constant is written out here so a build, where it is `false`, drops this branch entirely.
    else if (typeof __LOCAL_SIGN_IN__ === 'boolean' && __LOCAL_SIGN_IN__) await signInLocally();
    else await refreshSession();
    return { kind: 'done' };
  } catch (error) {
    // A logout while the refresh was in flight aborts it: that is not a failure.
    if (error instanceof DOMException && error.name === 'AbortError') return { kind: 'done' };
    if (error instanceof ApiError) {
      if (error.status === 403) return { kind: 'forbidden' };
      if (error.status === 401) return { kind: 'done', error };
    }
    return { kind: 'unavailable', error };
  }
}
