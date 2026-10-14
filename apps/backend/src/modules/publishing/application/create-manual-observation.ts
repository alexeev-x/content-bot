import { manualObservationSchema, type ManualObservationDto, type ManualObservationInput } from '@alexeev/contracts';
import { z } from 'zod';
import type { IdempotencyKeyRef } from '../../../platform/idempotency/d1-idempotency-store';
import { sha256Hex } from '../../../platform/security/sha256';
import { AppError } from '../../../shared/app-error';
import type { IdempotencyGate, PublicationAnalyticsRepository } from './ports';

export interface CreateManualObservationDeps {
  repo: PublicationAnalyticsRepository;
  idempotency: IdempotencyGate;
  now: number;
  newId: () => string;
}

export async function createManualObservation(
  deps: CreateManualObservationDeps,
  command: { actor: string; idempotencyKey: string; input: ManualObservationInput }
): Promise<ManualObservationDto> {
  const requestHash = await sha256Hex(JSON.stringify(command.input));
  const ref: IdempotencyKeyRef = {
    scope: command.actor,
    key: command.idempotencyKey,
    requestHash,
    claimedAt: deps.now
  };
  const claim = await deps.idempotency.claim(command.actor, command.idempotencyKey, requestHash, deps.now);
  if (claim.kind === 'reused') {
    throw new AppError('CONFLICT', 'Idempotency key was already used with a different payload', {
      reason: 'IDEMPOTENCY_KEY_REUSED'
    });
  }
  if (claim.kind === 'in_flight') {
    throw new AppError('CONFLICT', 'This request is still in progress', { reason: 'IN_FLIGHT' });
  }
  if (claim.kind === 'replay') {
    try {
      return manualObservationSchema.parse(JSON.parse(claim.responseBody) as unknown);
    } catch {
      throw new AppError('UNAVAILABLE', 'Stored analytics response is invalid');
    }
  }
  try {
    const observation = await deps.repo.createObservation({
      id: deps.newId(),
      actor: command.actor,
      now: deps.now,
      observation: command.input,
      idempotency: ref
    });
    if (observation === null) throw new AppError('CONFLICT', 'Idempotency claim expired', { reason: 'IN_FLIGHT' });
    return observation;
  } catch (error) {
    await deps.idempotency.release(ref).catch(() => undefined);
    if (error instanceof AppError) throw error;
    if (error instanceof z.ZodError) throw new AppError('UNAVAILABLE', 'Stored analytics observation is invalid');
    throw error;
  }
}
