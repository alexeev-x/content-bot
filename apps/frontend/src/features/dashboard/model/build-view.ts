import type { DashboardDto } from '@alexeev/contracts';
import type { StatusCheck } from '../../../shared/lib/status-check';
import type { DashboardView } from '../ui/view-model';
import type { ServiceRow } from './service-rows';

/** What the dashboard-fed widgets render: the day summary plus what the page adds (system checks). */
export function buildView(
  data: DashboardDto,
  checks: readonly StatusCheck[],
  services: readonly ServiceRow[]
): DashboardView {
  const problems = checks.filter((check) => check.tone === 'warning' || check.tone === 'danger').length;
  return {
    dashboard: data,
    attentionCount: Math.min(99, data.attentionTotal + problems),
    services
  };
}
