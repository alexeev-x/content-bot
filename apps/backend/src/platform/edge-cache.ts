// A small text cache on Cloudflare's own cache (the data centre's `caches.default`): free, no table, no migration.
// It keeps answers that repeat — STRATZ's weekly aggregates — so the same read inside the hour never leaves again
// (STRATZ refuses a key used from more than two IP addresses in 15 minutes, and our calls leave from many). A miss or
// a cache error is never fatal: the caller simply asks the source.

export interface TextCache {
  get(key: string): Promise<string | null>;
  put(key: string, body: string): Promise<void>;
}

const ORIGIN = 'https://edge-cache.internal';

async function digest(key: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** `namespace` keeps sources apart; `ttlSeconds` is how long an answer is reused. */
export function edgeTextCache(namespace: string, ttlSeconds: number): TextCache | undefined {
  const store = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  if (store === undefined) return undefined;
  const url = async (key: string) => `${ORIGIN}/${namespace}/${await digest(key)}`;
  return {
    async get(key) {
      try {
        const hit = await store.match(await url(key));
        return hit === undefined ? null : await hit.text();
      } catch {
        return null;
      }
    },
    async put(key, body) {
      try {
        await store.put(
          await url(key),
          new Response(body, {
            headers: { 'content-type': 'application/json', 'cache-control': `max-age=${ttlSeconds}` }
          })
        );
      } catch {
        // A cache that can't keep it costs one more request next time, nothing else.
      }
    }
  };
}

/** STRATZ's answers are reused for an hour: its hero aggregates move weekly, match reads don't change. */
export const STRATZ_CACHE_SECONDS = 3600;
