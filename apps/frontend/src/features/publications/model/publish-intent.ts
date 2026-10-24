import { classifyApiError } from '../../../shared/api/error-kind';

/**
 * One publish intent: everything that decides the server's idempotency fingerprint, frozen at the first submit.
 * It lives until the server answered definitively, so a retry after a lost 202 (any delay, remount or reload)
 * sends exactly the same request and the server replays the stored result instead of creating a second post.
 */
export type PublishIntent = {
  postId: string;
  revision: number;
  destinationId: string;
  mode: 'now' | 'later';
  /** UTC instant, frozen at the first submit (for «Сейчас» it is that moment). */
  scheduledAt: string;
  timezone: string;
  key: string;
  /** Epoch ms of the first submit: the server forgets an idempotency key after 24 h. */
  createdAt: number;
};

/** Per-component copy of the intents, read first: sessionStorage may be blocked (private mode, policy). */
export type IntentMemory = Map<string, PublishIntent>;
export const createIntentMemory = (): IntentMemory => new Map();

/** The server replays a key for 24 h; an older intent is no longer protected, so it needs a check first. */
export const INTENT_TRUSTED_MS = 23 * 3_600_000;

const PREFIX = 'publish-intent:';
const prefixFor = (postId: string, revision: number) => `${PREFIX}${postId}:${revision}:`;
const storageKey = (intent: Pick<PublishIntent, 'postId' | 'revision' | 'destinationId'>) =>
  `${prefixFor(intent.postId, intent.revision)}${intent.destinationId}`;

function store(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

function parse(raw: string | null): PublishIntent | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const v = value as Record<string, unknown>;
    const ok =
      typeof v['postId'] === 'string' &&
      typeof v['revision'] === 'number' &&
      typeof v['destinationId'] === 'string' &&
      (v['mode'] === 'now' || v['mode'] === 'later') &&
      typeof v['scheduledAt'] === 'string' &&
      typeof v['timezone'] === 'string' &&
      typeof v['key'] === 'string' &&
      typeof v['createdAt'] === 'number';
    return ok ? (value as PublishIntent) : null;
  } catch {
    return null;
  }
}

export function saveIntent(memory: IntentMemory, intent: PublishIntent): void {
  memory.set(storageKey(intent), intent);
  try {
    store()?.setItem(storageKey(intent), JSON.stringify(intent));
  } catch {
    // Storage is a safety net: without it the intent still survives while the dialog stays mounted.
  }
}

export function clearIntent(
  memory: IntentMemory,
  intent: Pick<PublishIntent, 'postId' | 'revision' | 'destinationId'>
): void {
  memory.delete(storageKey(intent));
  try {
    store()?.removeItem(storageKey(intent));
  } catch {
    // nothing to clear
  }
}

/** The pending intent for this post revision: for one destination, or the first stored one when none is chosen yet. */
export function findIntent(
  memory: IntentMemory,
  postId: string,
  revision: number,
  destinationId?: string
): PublishIntent | null {
  const prefix = prefixFor(postId, revision);
  if (destinationId) {
    const known = memory.get(storageKey({ postId, revision, destinationId }));
    if (known) return known;
  } else {
    for (const [name, intent] of memory) if (name.startsWith(prefix)) return intent;
  }
  const storage = store();
  if (!storage) return null;
  try {
    if (destinationId) return parse(storage.getItem(storageKey({ postId, revision, destinationId })));
    for (let index = 0; index < storage.length; index += 1) {
      const name = storage.key(index);
      if (name?.startsWith(prefix)) return parse(storage.getItem(name));
    }
  } catch {
    return null;
  }
  return null;
}

/** `scheduledAt` is omitted for «Сейчас»: the instant is taken here, once, and then frozen with the key. */
export function newIntent(
  fields: Omit<PublishIntent, 'key' | 'scheduledAt' | 'createdAt'> & { scheduledAt?: string | undefined }
): PublishIntent {
  return {
    ...fields,
    scheduledAt: fields.scheduledAt ?? new Date().toISOString(),
    key: crypto.randomUUID(),
    createdAt: Date.now()
  };
}

/**
 * Whether the server's answer settles the intent. A success, or a refusal that will not change on repeat, ends it.
 * No answer (network, timeout, 5xx), an in-flight twin, a rate limit and anything unrecognised keep it: the
 * request may have been applied, so the next attempt must be the same request.
 */
export function isDefinitive(error: unknown): boolean {
  switch (classifyApiError(error)) {
    case 'unavailable':
    case 'in_flight':
    case 'rate_limited':
    case 'unauthorized':
    case 'unexpected':
    case 'unknown_send_result':
      return false;
    default:
      return true;
  }
}
