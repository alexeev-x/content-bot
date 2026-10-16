import { whenRefreshIdle } from '../shared/api/http-client';

const KEY = 'stale-build-reload-at';
/** A second failure this soon after a reload is not a stale build; let the error show instead of looping. */
const LOOP_GUARD_MS = 30_000;

/**
 * A deploy removes the previous build's chunks, and the SPA fallback answers them with index.html, so a tab
 * opened before the deploy fails on its next lazy route or style. Vite reports that as `vite:preloadError`;
 * one reload picks up the new build.
 */
export function reloadOnStaleBuild() {
  window.addEventListener('vite:preloadError', (event) => {
    try {
      if (Date.now() - Number(sessionStorage.getItem(KEY) ?? 0) < LOOP_GUARD_MS) return;
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
      // Blocked storage leaves no loop guard, so the error shows as it would without this handler.
      return;
    }
    event.preventDefault();
    // Never in the middle of a session refresh: cutting one short signs the owner out (http-client.ts).
    void whenRefreshIdle(() => window.location.reload());
  });
}
