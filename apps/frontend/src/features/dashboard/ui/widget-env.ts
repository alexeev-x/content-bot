import type { ServiceRow } from '../model/service-rows';
import type { DashboardView } from './view-model';

/** What every widget needs from the page; the page owns the data and the navigation, the widgets only draw. */
export type WidgetEnv = {
  /** The loaded `/dashboard` day; undefined while it loads: widgets draw skeletons. */
  view: DashboardView | undefined;
  /** One line per service (system checks mapped by the page). */
  services: readonly ServiceRow[] | undefined;
  now: Date;
  phone: boolean;
  /** Owner timezone for calendar projections and date links. */
  timezone?: string;
  onOpenPublication: (publicationId: string) => void;
  onNewPost: () => void;
  onOpenPosts: () => void;
};
