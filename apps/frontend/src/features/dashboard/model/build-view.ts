import type { DashboardDto } from '@alexeev/contracts';
import type { DashboardView } from '../ui/view-model';
import type { ServiceRow } from './service-rows';

/** What the dashboard-fed widgets render: the day summary plus what the page adds (service lights). */
export function buildView(data: DashboardDto, services: readonly ServiceRow[]): DashboardView {
  return { dashboard: data, services };
}
