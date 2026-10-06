import { type AppearanceDto, appearanceSchema, type UpdateAppearanceInput } from '@alexeev/contracts';
import type { Logger } from '../../../platform/logging/logger';
import { AppError } from '../../../shared/app-error';
import type { SettingRecord, SettingsRepository } from './ports';

const KEY = 'appearance';

function defaults(revision: number, updatedAt: number | null): AppearanceDto {
  return {
    themeMode: 'system',
    lightAccent: { kind: 'preset', id: 'cobalt' },
    darkAccent: { kind: 'preset', id: 'cobalt' },
    customPresets: [],
    revision,
    updatedAt: updatedAt === null ? null : new Date(updatedAt).toISOString()
  };
}

// The fields stored in the document; revision and updatedAt live in their own columns.
const DOCUMENT_FIELDS = ['themeMode', 'lightAccent', 'darkAccent', 'customPresets'] as const;

function toDto(document: unknown, revision: number, updatedAt: number | null): AppearanceDto | null {
  const parsed = appearanceSchema.safeParse({
    ...(typeof document === 'object' && document !== null ? document : {}),
    revision,
    updatedAt: updatedAt === null ? null : new Date(updatedAt).toISOString()
  });
  return parsed.success ? parsed.data : null;
}

function parseStored(record: SettingRecord): AppearanceDto | null {
  try {
    return toDto(JSON.parse(record.value), record.revision, record.updatedAt);
  } catch {
    return null;
  }
}

// A stored time outside the Date range (or not a number at all) cannot become an ISO string.
function validEpoch(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) <= 8.64e15;
}

// A row that cannot be shown as the contract describes is logged and answered with the defaults, so
// the owner's UI keeps working, whereas an error would lock the owner out until someone edits D1:
// - a document that no longer parses keeps the stored revision and time, and an ordinary save
//   carrying that revision repairs it;
// - a revision that is not a safe positive integer is reported as 1 (the repository's guard treats
//   such a row as revision 1 as well) and an unusable updated_at as null;
// - the whole row counts as corrupt then, even if its document is fine, because the columns are
//   what the response is built from.
async function read(deps: {
  repo: SettingsRepository;
  logger: Logger;
  requestId: string;
}): Promise<{ dto: AppearanceDto; corrupt: boolean }> {
  const record = await deps.repo.find(KEY);
  if (record === null) return { dto: defaults(0, null), corrupt: false };
  const revision = Number.isSafeInteger(record.revision) && record.revision >= 1 ? record.revision : null;
  const updatedAt = validEpoch(record.updatedAt) ? record.updatedAt : null;
  const dto = revision !== null && updatedAt !== null ? parseStored(record) : null;
  if (dto !== null) return { dto, corrupt: false };
  deps.logger.error({
    component: 'settings',
    operation: 'read appearance',
    requestId: deps.requestId,
    errorCode: 'SETTINGS_CORRUPT'
  });
  return { dto: defaults(revision ?? 1, updatedAt), corrupt: true };
}

export async function getAppearance(deps: {
  repo: SettingsRepository;
  logger: Logger;
  requestId: string;
}): Promise<AppearanceDto> {
  return (await read(deps)).dto;
}

function staleRevision(): AppError {
  return new AppError('CONFLICT', 'The settings changed since this revision was read', { reason: 'STALE_REVISION' });
}

// Replaces the whole document. The revision is checked twice: here, to answer without a write, and
// in the repository's guarded batch, which is what actually settles a race.
export async function saveAppearance(
  deps: { repo: SettingsRepository; logger: Logger; requestId: string; now: number },
  command: { actor: string; input: UpdateAppearanceInput }
): Promise<AppearanceDto> {
  const { actor, input } = command;
  const current = await read(deps);
  if (current.dto.revision !== input.revision) throw staleRevision();

  const document = {
    themeMode: input.themeMode,
    lightAccent: input.lightAccent,
    darkAccent: input.darkAccent,
    customPresets: input.customPresets
  };
  // Comparing only against a document that parsed; after a repair save every field counts as changed.
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
