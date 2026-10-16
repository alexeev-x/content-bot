import type { ActivityItemDto, PostPageDto, PublicationPageDto } from '@alexeev/contracts';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { SourceRow } from './SourcesWidget';
import type { DashboardView } from './view-model';

/** What every widget needs from the page; the page owns the data and the navigation, the widgets only draw. */
export type WidgetEnv = {
  /** The loaded `/dashboard` day; undefined while it loads: widgets draw skeletons. */
  view: DashboardView | undefined;
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
  /** Today's studio events for the second lane of «Лента дня»; undefined while loading. */
  dayEvents: readonly ActivityItemDto[] | undefined;
  /** Opens the activity detail dialog with one event or the events of one dot. */
  onOpenActivity: (items: readonly ActivityItemDto[]) => void;
  /** Bodies of the content-analytics widgets, composed by the page (features never import each other). */
  analytics?: AnalyticsSlots | undefined;
  /** Rows of «Новости и источники», composed by the page from the Dota feed and the analytics sources. */
  sources?: { rows: readonly SourceRow[] | undefined; footer?: string } | undefined;
  onOpenPost: (postId: string) => void;
  /** «ИИ расходы», composed by the page from the AI settings feature; without it «Лента дня» takes the row. */
  ai?: { badge: ReactNode; body: ReactNode } | undefined;
  /** «Дота»: rank and stats, composed by the page; without it the row keeps two widgets. */
  dota?: ReactNode;
};

export type AnalyticsSlots = {
  latestYoutube: ReactNode;
  latestTiktok: ReactNode;
  trending: ReactNode;
  onOpenAll: () => void;
};
