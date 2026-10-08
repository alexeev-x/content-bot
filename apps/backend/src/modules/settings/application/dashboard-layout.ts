import { type DashboardLayoutDto, dashboardLayoutSchema, type UpdateDashboardLayoutInput } from '@alexeev/contracts';
import type { Logger } from '../../../platform/logging/logger';
import { AppError } from '../../../shared/app-error';
import type { DashboardLayoutRepository } from './ports';

// A row that cannot be shown as the contract describes is logged and answered as an empty layout at
// the stored revision, so the owner's page keeps working (the client shows an empty Обзор with
// «Сбросить к стандартному» and «Добавить виджет») and an ordinary save carrying that revision repairs the row.
async function read(deps: {
  repo: DashboardLayoutRepository;
  logger: Logger;
  requestId: string;
}): Promise<DashboardLayoutDto> {
  const record = await deps.repo.find();
  if (record === null) return { revision: 0, widgets: [] };
  let widgets: unknown;
  try {
    widgets = JSON.parse(record.value);
  } catch {
    widgets = null;
  }
  const parsed = dashboardLayoutSchema.safeParse({ revision: record.revision, widgets });
  if (parsed.success) return parsed.data;
  deps.logger.error({
    component: 'settings',
    operation: 'read dashboard layout',
    requestId: deps.requestId,
    errorCode: 'SETTINGS_CORRUPT'
  });
  return { revision: record.revision, widgets: [] };
}

export function getDashboardLayout(deps: {
  repo: DashboardLayoutRepository;
  logger: Logger;
  requestId: string;
}): Promise<DashboardLayoutDto> {
  return read(deps);
}

function staleRevision(): AppError {
  return new AppError('CONFLICT', 'The layout changed since this revision was read', { reason: 'STALE_REVISION' });
}

// Replaces the whole layout. The revision is checked twice: here, to answer without a write, and in
// the repository's guarded batch, which is what actually settles a race.
export async function saveDashboardLayout(
  deps: { repo: DashboardLayoutRepository; logger: Logger; requestId: string; now: number },
  command: { actor: string; input: UpdateDashboardLayoutInput }
): Promise<DashboardLayoutDto> {
  const { actor, input } = command;
  const current = await read(deps);
  if (current.revision !== input.revision) throw staleRevision();

  const outcome = await deps.repo.save({
    value: JSON.stringify(input.widgets),
    expectedRevision: input.revision,
    actor,
    now: deps.now,
    widgetCount: input.widgets.length
  });
  if (outcome === 'not_applied') throw staleRevision();
  return { revision: input.revision + 1, widgets: input.widgets };
}
