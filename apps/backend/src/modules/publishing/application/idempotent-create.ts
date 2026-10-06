import { AppError } from '../../../shared/app-error';
import type { IdempotencyGate, IdempotencyRef } from './ports';

export function inFlight(): AppError {
  return new AppError('CONFLICT', 'A request with this Idempotency-Key is still being processed', {
    reason: 'IN_FLIGHT'
  });
}

// Claims the key, answers a replay from the stored response, and frees the key when the work
// throws so the client can retry at once (if the release itself fails, the lease expires).
export async function runIdempotent<T>(
  call: {
    gate: IdempotencyGate;
    actor: string;
    key: string;
    requestHash: string;
    now: number;
    replay: (body: string) => T;
  },
  work: (ref: IdempotencyRef) => Promise<T>
): Promise<T> {
  const { gate, actor, key, requestHash, now } = call;
  const claim = await gate.claim(actor, key, requestHash, now);
  switch (claim.kind) {
    case 'replay':
      return call.replay(claim.responseBody);
    case 'reused':
      throw new AppError('CONFLICT', 'Idempotency-Key was already used with a different payload', {
        reason: 'IDEMPOTENCY_KEY_REUSED'
      });
    case 'in_flight':
      throw inFlight();
    case 'claimed':
      break;
  }

  const ref = { scope: actor, key, requestHash, claimedAt: now };
  try {
    return await work(ref);
  } catch (error) {
    await gate.release(ref).catch(() => undefined);
    throw error;
  }
}
