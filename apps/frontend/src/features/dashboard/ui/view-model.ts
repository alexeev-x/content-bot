import type { DashboardDto } from '@alexeev/contracts';
import type { ServiceRow } from '../model/service-rows';

/** What the loaded dashboard renders: the server data plus what the page adds (system checks). */
export type DashboardView = {
  dashboard: DashboardDto;
  /** Server incidents and stuck sends plus failing checks: the number the KPI tile shows. */
  attentionCount: number;
  services: readonly ServiceRow[];
  /** `sent` rows among today's listed ones. */
};
