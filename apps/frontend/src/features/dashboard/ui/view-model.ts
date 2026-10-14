import type { DashboardDto } from '@alexeev/contracts';
import type { ServiceRow } from '../model/service-rows';

/** What the loaded dashboard renders: the server data plus what the page adds (system checks). */
export type DashboardView = {
  dashboard: DashboardDto;
  services: readonly ServiceRow[];
};
