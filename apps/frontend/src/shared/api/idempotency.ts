// One Idempotency-Key per user intent. The same payload retried keeps the key (the server then replays
// the stored result instead of creating a duplicate); a changed payload is a new intent and gets a new
// key, because the server answers IDEMPOTENCY_KEY_REUSED for a key reused with a different payload.
// Intents may overlap (A in flight while B is submitted), so each payload keeps its own key and a
// success releases only the key that succeeded.
export type IdempotencyTracker = {
  keyFor(payload: unknown): string;
  /** Call with the key the server confirmed: that intent is done, a repeat is a new intent. */
  release(key: string): void;
};

// Bounds memory when many different payloads fail and are abandoned.
const MAX_TRACKED = 50;

export function createIdempotencyTracker(): IdempotencyTracker {
  const keys = new Map<string, string>();
  return {
    keyFor(payload) {
      const fingerprint = JSON.stringify(payload);
      let key = keys.get(fingerprint);
      if (key === undefined) {
        key = crypto.randomUUID();
        keys.set(fingerprint, key);
        if (keys.size > MAX_TRACKED) {
          const oldest = keys.keys().next().value;
          if (oldest !== undefined) keys.delete(oldest);
        }
      }
      return key;
    },
    release(key) {
      for (const [fingerprint, value] of keys) {
        if (value === key) keys.delete(fingerprint);
      }
    }
  };
}
