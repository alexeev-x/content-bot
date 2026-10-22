import { ownerOperationsSettingsSchema } from '@alexeev/contracts';
import type { Api } from './harness';

/** Switches on «Планирование» and «Опубликовано» (off by default since 22.10.2026) for tests of those notices. */
export async function enableOwnerNotices(api: Api): Promise<void> {
  const current = ownerOperationsSettingsSchema.parse(await (await api.request('/api/v1/settings/operations')).json());
  const response = await api.request('/api/v1/settings/operations', {
    method: 'PUT',
    json: {
      timezone: current.timezone,
      notifications: { ...current.notifications, scheduleNotices: true, sentNotices: true },
      revision: current.revision
    }
  });
  if (response.status !== 200) throw new Error(`settings PUT answered ${response.status}`);
}
