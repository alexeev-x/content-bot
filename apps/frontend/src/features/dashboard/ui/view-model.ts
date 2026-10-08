import type { DashboardDto } from '@alexeev/contracts';
import type { AttentionRow } from '../model/attention-rows';
import type { ServiceRow } from '../model/service-rows';

/** What the loaded dashboard renders: the server data plus what the page adds (system checks). */
export type DashboardView = {
  dashboard: DashboardDto;
  rows: readonly AttentionRow[];
  /** Server incidents and stuck sends plus failing checks: the number the KPI and the panel count show. */
  attentionCount: number;
  /** A system check has not answered yet. */
  checking: boolean;
  services: readonly ServiceRow[];
  /** `sent` rows among today's listed ones. */
  sentToday: number;
};
