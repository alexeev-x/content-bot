import type { DashboardDto } from '@alexeev/contracts';

/** What the loaded dashboard renders: the server's day summary. */
export type DashboardView = {
  dashboard: DashboardDto;
};
