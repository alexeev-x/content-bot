import type { PostPageDto, PublicationPageDto } from '@alexeev/contracts';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ChannelRow } from '../model/channel-rows';
import type { ServiceRow } from '../model/service-rows';
import type { DashboardView } from './view-model';

/** What every widget needs from the page; the page owns the data and the navigation, the widgets only draw. */
export type WidgetEnv = {
  /** The loaded `/dashboard` day; undefined while it loads: widgets draw skeletons. */
  view: DashboardView | undefined;
  /** One light per service (system checks mapped by the page). */
  services: readonly ServiceRow[] | undefined;
  /** The week's publications and the newest drafts: separate reads, so each widget has its own loading and error. */
  week: UseQueryResult<PublicationPageDto> | undefined;
  drafts: UseQueryResult<PostPageDto> | undefined;
  now: Date;
  phone: boolean;
  /** Owner timezone for calendar projections and date links. */
  timezone: string;
  onOpenPublication: (publicationId: string) => void;
  /** Opens the publication list for one owner-zone day. */
  onOpenDay: (day: { from: string; to: string }) => void;
  onNewPost: () => void;
  /** Opens the publish screen of a draft. */
  onPublishDraft: (postId: string) => void;
  /** Today's publications in the list (KPI tiles). */
  onOpenToday: () => void;
  /** Публикации → Ошибки (KPI tile). */
  onOpenErrors: () => void;
  /** Connected channels with the bot's state; undefined while loading. */
  channels: readonly ChannelRow[] | undefined;
};
