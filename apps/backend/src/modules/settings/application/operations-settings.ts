import {
  type OwnerOperationsSettingsDto,
  ownerOperationsSettingsSchema,
  type UpdateOwnerOperationsSettingsInput
} from '@alexeev/contracts';
import type { Logger } from '../../../platform/logging/logger';
import { AppError } from '../../../shared/app-error';
import type { SettingRecord, SettingsRepository } from './ports';

const KEY = 'operations';
const DEFAULTS = {
  timezone: 'Europe/Moscow',
  notifications: {
    warningsEnabled: true,
    publicationAlerts: true,
    sourceAlerts: true,
    automationAlerts: true,
    recoveryAlerts: true,
    dotaWatchlistAlerts: true,
    scheduleNotices: true,
    sentNotices: true
  }
} as const;
const DOCUMENT_FIELDS = ['timezone', 'notifications'] as const;

function validEpoch(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) <= 8.64e15;
}

function fromStored(record: SettingRecord): OwnerOperationsSettingsDto | null {
  try {
    const document: unknown = JSON.parse(record.value);
    const revision = Number.isSafeInteger(record.revision) && record.revision >= 1 ? record.revision : null;
    if (revision === null || !validEpoch(record.updatedAt)) return null;
    return ownerOperationsSettingsSchema.parse({
      ...(typeof document === 'object' && document !== null ? document : {}),
      revision,
      updatedAt: new Date(record.updatedAt).toISOString()
    });
  } catch {
    return null;
  }
}

async function read(deps: {
  repo: SettingsRepository;
  logger: Logger;
  requestId: string;
}): Promise<{ dto: OwnerOperationsSettingsDto; corrupt: boolean }> {
  const record = await deps.repo.find(KEY);
  if (record === null) return { dto: { ...DEFAULTS, revision: 0, updatedAt: null }, corrupt: false };
  const stored = fromStored(record);
  if (stored !== null) return { dto: stored, corrupt: false };
  const revision = Number.isSafeInteger(record.revision) && record.revision >= 1 ? record.revision : 1;
  const updatedAt = validEpoch(record.updatedAt) ? new Date(record.updatedAt).toISOString() : null;
  deps.logger.error({
    component: 'settings',
    operation: 'read operations',
    requestId: deps.requestId,
    errorCode: 'SETTINGS_CORRUPT'
  });
  return { dto: { ...DEFAULTS, revision, updatedAt }, corrupt: true };
}

export async function getOwnerOperationsSettings(deps: {
  repo: SettingsRepository;
  logger: Logger;
  requestId: string;
}): Promise<OwnerOperationsSettingsDto> {
  return (await read(deps)).dto;
}

function staleRevision(): AppError {
  return new AppError('CONFLICT', 'The settings changed since this revision was read', { reason: 'STALE_REVISION' });
}

export async function saveOwnerOperationsSettings(
  deps: { repo: SettingsRepository; logger: Logger; requestId: string; now: number },
  command: { actor: string; input: UpdateOwnerOperationsSettingsInput }
): Promise<OwnerOperationsSettingsDto> {
  const { actor, input } = command;
  const current = await read(deps);
  if (current.dto.revision !== input.revision) throw staleRevision();

  const document = { timezone: input.timezone, notifications: input.notifications };
  const fields = DOCUMENT_FIELDS.filter(
    (field) => current.corrupt || JSON.stringify(current.dto[field]) !== JSON.stringify(document[field])
  );
  const outcome = await deps.repo.save({
    key: KEY,
    value: JSON.stringify(document),
    expectedRevision: input.revision,
    actor,
    now: deps.now,
    fields
  });
  if (outcome === 'not_applied') throw staleRevision();
  return { ...document, revision: input.revision + 1, updatedAt: new Date(deps.now).toISOString() };
}
