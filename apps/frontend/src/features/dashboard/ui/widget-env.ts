import type { ServiceRow } from '../model/service-rows';
import type { DashboardView } from './view-model';

/** What every widget needs from the page; the page owns the data and the navigation, the widgets only draw. */
export type WidgetEnv = {
  /** The loaded `/dashboard` day; undefined while it loads (or in the skeleton): fed widgets draw skeletons. */
  view: DashboardView | undefined;
  /** One line per service (system checks mapped by the page). */
  services: readonly ServiceRow[] | undefined;
  /** Draw every widget as its skeleton and start no request (the route skeleton has no session yet). */
  skeleton: boolean;
  now: Date;
  phone: boolean;
  /** Owner timezone for calendar projections and date links. */
  timezone?: string;
  onOpenPublication: (publicationId: string) => void;
  onNewPost: () => void;
  onOpenPosts: () => void;
  onOpenPost: (postId: string) => void;
  onAddChannel: () => void;
  /** Quick actions do their work in place: the page opens its own dialogs (features never import each other). */
  onQuickNewPost: () => void;
  onQuickPublish: () => void;
  onQuickAddChannel: () => void;
};
