const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
// An in-flight claim is a lease: if the request dies before completing, the key is free again
// after this long instead of staying locked for the whole replay window.
const IN_FLIGHT_LEASE_MS = 60 * 1000;

export type IdempotencyClaim =
  | { kind: 'claimed' }
  | { kind: 'replay'; responseStatus: number; responseBody: string }
  | { kind: 'reused' }
  | { kind: 'in_flight' };

export interface IdempotencyKeyRef {
  scope: string;
  key: string;
  requestHash: string;
  /** The `now` of the claim; it identifies this claim among later takeovers of the same key. */
  claimedAt: number;
}

interface ExistingRow {
  request_hash: string;
  status: 'in_flight' | 'completed';
  response_status: number | null;
  response_body: string | null;
}

// One conditional upsert decides the race: it inserts a new key, or takes over an expired one.
// Zero changes means a live claim exists, which we then read to answer replay / reuse / in flight.
export function createIdempotencyStore(db: D1Database) {
  return {
    async claim(scope: string, key: string, requestHash: string, now: number): Promise<IdempotencyClaim> {
      const claimed = await db
        .prepare(
          `INSERT INTO idempotency_keys (scope, key, request_hash, status, created_at, expires_at)
           VALUES (?1, ?2, ?3, 'in_flight', ?4, ?5)
           ON CONFLICT (scope, key) DO UPDATE SET
             request_hash = excluded.request_hash,
             status = 'in_flight',
             response_status = NULL,
             response_body = NULL,
             created_at = excluded.created_at,
             expires_at = excluded.expires_at
           WHERE idempotency_keys.expires_at <= ?4`
        )
        .bind(scope, key, requestHash, now, now + IN_FLIGHT_LEASE_MS)
        .run();
      if (claimed.meta.changes === 1) return { kind: 'claimed' };

      const existing = await db
        .prepare(
          'SELECT request_hash, status, response_status, response_body FROM idempotency_keys WHERE scope = ?1 AND key = ?2'
        )
        .bind(scope, key)
        .first<ExistingRow>();
      if (existing === null) return { kind: 'in_flight' };
      if (existing.request_hash !== requestHash) return { kind: 'reused' };
      if (existing.status === 'completed' && existing.response_status !== null && existing.response_body !== null) {
        return { kind: 'replay', responseStatus: existing.response_status, responseBody: existing.response_body };
      }
      return { kind: 'in_flight' };
    },

    // Frees a claim after a failed attempt so the client can retry at once.
    async release(ref: IdempotencyKeyRef): Promise<void> {
      await db
        .prepare(
          `DELETE FROM idempotency_keys
           WHERE scope = ?1 AND key = ?2 AND request_hash = ?3 AND created_at = ?4 AND status = 'in_flight'`
        )
        .bind(ref.scope, ref.key, ref.requestHash, ref.claimedAt)
        .run();
    }
  };
}

// SQL fragment, true only while this exact claim is still ours and unfinished. It uses four
// numbered parameters starting at `first`: scope, key, request hash, claimedAt.
export function ownsClaimSql(first: number): string {
  const [scope, key, hash, claimedAt] = [0, 1, 2, 3].map((offset) => `?${first + offset}`);
  return `EXISTS (SELECT 1 FROM idempotency_keys WHERE scope = ${scope} AND key = ${key}
    AND request_hash = ${hash} AND created_at = ${claimedAt} AND status = 'in_flight')`;
}

// The last statement of the batch that performs the work, so the result is stored atomically with it.
// `requires` is for work that can be refused by its own guard without failing the batch: the key
// is completed only while that SQL holds, so a refused write never leaves a stored success behind.
// Its parameters are numbered from ?8.
export function completeIdempotencyStatement(
  db: D1Database,
  ref: IdempotencyKeyRef,
  response: { status: number; body: string },
  completedAt: number,
  requires?: { sql: string; bindings: (string | number)[] }
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE idempotency_keys
       SET status = 'completed', response_status = ?5, response_body = ?6, expires_at = ?7
       WHERE scope = ?1 AND key = ?2 AND request_hash = ?3 AND created_at = ?4 AND status = 'in_flight'${
         requires === undefined ? '' : ` AND ${requires.sql}`
       }`
    )
    .bind(
      ref.scope,
      ref.key,
      ref.requestHash,
      ref.claimedAt,
      response.status,
      response.body,
      completedAt + IDEMPOTENCY_TTL_MS,
      ...(requires?.bindings ?? [])
    );
}
