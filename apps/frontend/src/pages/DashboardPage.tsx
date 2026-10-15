import { useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useDocumentTitle } from '../app/use-document-title';
import {
  contentOverviewQueryOptions,
  CrossPlatformSummary,
  LatestVideoSummary,
  PlatformLogo,
  TrendingSummary,
  WeekStatsSummary
} from '../features/content-analytics';
import { sourceEventsQueryOptions } from '../features/dota-intelligence';
import { Dashboard, DateChip, type PageBindings, type SourceRow, useDashboardQuery } from '../features/dashboard';
import { destinationsInfiniteQueryOptions } from '../features/destinations';
import { MediaPanel, MediaThumb } from '../features/media';
import { PublicationDrawer, publicationQueryOptions } from '../features/publications';
import { useOwnerTimezone } from '../features/owner-settings';
import { utcOffsetLabel } from '../shared/lib/owner-timezone';
import { useNow } from '../shared/lib/use-now';
import { ru } from '../shared/lib/ru';
import { relativeTimeRu } from '../shared/lib/ru-format';
import { Button, Icon, PageHeader, useMediaQuery } from '../shared/ui';

type Props = {
  /** Test hook: dashboard poll interval in ms (production uses the 60 s default). */
  pollMs?: number;
  /** The publication whose panel is open over Обзор (`?id=` in the URL). */
  openPublicationId?: string | undefined;
  onOpenPublicationChange?: (id: string | undefined) => void;
};

export function DashboardPage({ pollMs, openPublicationId, onOpenPublicationChange }: Props) {
  useDocumentTitle(ru.pages.dashboard);
  const navigate = useNavigate();
  const timezone = useOwnerTimezone();
  const now = useNow();
  const dashboard = useDashboardQuery(pollMs, timezone);
  const zoneNote = `${timezone}, ${utcOffsetLabel(now, timezone)}`;
  const [openMedia, setOpenMedia] = useState<{ id: string; fileName: string } | null>(null);
  const phone = useMediaQuery('(max-width: 859px)');
  const destinations = useInfiniteQuery(destinationsInfiniteQueryOptions({ enabled: true }));
  const destinationList = destinations.data?.pages.flatMap((page) => page.items);
  const openPublication = (id: string | undefined) =>
    onOpenPublicationChange
      ? onOpenPublicationChange(id)
      : id && void navigate({ to: '/publications', search: { id } });

  const queryClient = useQueryClient();
  const openAnalyticsItem = (id: string) => void navigate({ to: '/analytics', search: { id } });
  // «Новости и источники»: the latest Dota updates, then the analytics sources that need a look.
  const events = useQuery(sourceEventsQueryOptions({ page: 1, limit: 3 }));
  const overview = useQuery(contentOverviewQueryOptions());
  const nowMs = now.getTime();
  const sourceRows: SourceRow[] | undefined =
    events.data === undefined && overview.data === undefined
      ? undefined
      : [
          ...(events.data?.items ?? []).map((event): SourceRow => ({
            id: event.id,
            mark: <Icon name="zap" size={18} />,
            title: event.sourceName,
            subtitle: event.title,
            time: relativeTimeRu(event.publishedAt, nowMs),
            action: event.draft
              ? {
                  label: 'Открыть',
                  onPress: () => void navigate({ to: '/posts/$id', params: { id: event.draft!.postId } })
                }
              : {
                  label: 'Создать пост',
                  primary: true,
                  onPress: () => void navigate({ to: '/sources', search: { update: event.id } })
                }
          })),
          ...(overview.data?.sources ?? [])
            .filter((source) => source.state === 'error' || source.connection === 'available')
            .map((source): SourceRow => ({
              id: `analytics:${source.platform}`,
              mark: <PlatformLogo platform={source.platform} size={22} />,
              title: source.state === 'error' ? 'Источник с ошибкой' : 'Источник не подключён',
              subtitle: `${source.platform === 'telegram' ? 'Telegram' : source.platform === 'youtube' ? 'YouTube' : 'TikTok'}: ${source.state === 'error' ? 'сбор не удался' : 'нужен вход'}`,
              attention: true,
              action: { label: 'Проверить', onPress: () => void navigate({ to: '/settings/analytics' }) }
            }))
        ];
  const active = (overview.data?.sources ?? []).filter((source) => source.state === 'ok').length;
  const lastSync = (overview.data?.sources ?? [])
    .map((source) => source.lastSyncedAt)
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1);
  const sourcesFooter = overview.data
    ? `Активных источников аналитики: ${active} из ${overview.data.sources.length}${lastSync ? `. Последняя синхронизация ${relativeTimeRu(lastSync, nowMs)}` : ''}`
    : undefined;
  const bindings: PageBindings = {
    query: dashboard,
    zoneNote,
    timezone,
    onOpenPublication: (id) => openPublication(id),
    onOpenDay: (day) => void navigate({ to: '/publications', search: { from: day.from, to: day.to } }),
    onNewPost: () => void navigate({ to: '/posts/new' }),
    onPublishDraft: (id) => void navigate({ to: '/posts/$id/publish', params: { id } }),
    onOpenPost: (id) => void navigate({ to: '/posts/$id', params: { id } }),
    onOpenMedia: (media) => setOpenMedia(media),
    renderMediaPreview: (media) => <MediaThumb mediaId={media.id} fileName={media.fileName} />,
    analytics: {
      latestYoutube: <LatestVideoSummary platform="youtube" onOpen={openAnalyticsItem} />,
      latestTiktok: <LatestVideoSummary platform="tiktok" onOpen={openAnalyticsItem} />,
      trending: <TrendingSummary timezone={timezone} onOpen={openAnalyticsItem} />,
      crossPlatform: <CrossPlatformSummary onOpen={openAnalyticsItem} />,
      weekStats: <WeekStatsSummary timezone={timezone} />,
      onOpenAll: () => void navigate({ to: '/analytics' })
    },
    sources: { rows: sourceRows, footer: sourcesFooter },
    onEditPublication: (id) =>
      void queryClient
        .fetchQuery(publicationQueryOptions(id))
        .then((publication) => navigate({ to: '/posts/$id', params: { id: publication.postId } }))
  };
  // The panel's own detail query (same key): it tells which channel the message link belongs to.
  const openDetail = useQuery({
    ...publicationQueryOptions(openPublicationId ?? ''),
    enabled: openPublicationId !== undefined
  });
  const drawerDestination = destinationList?.find((destination) => destination.id === openDetail.data?.destinationId);

  return (
    <>
      <PageHeader
        title={ru.pages.dashboard}
        actions={
          <>
            <DateChip placement="header" zoneNote={zoneNote} timezone={timezone} />
            {/* On a phone the tab bar's «+» creates a post: no second button on the page. */}
            {phone ? null : (
              <Button icon="plus" onPress={() => void navigate({ to: '/posts/new' })}>
                Новый пост
              </Button>
            )}
          </>
        }
      />
      <Dashboard {...bindings} />
      <MediaPanel
        media={openMedia}
        onClose={() => setOpenMedia(null)}
        onOpenPost={(id) => void navigate({ to: '/posts/$id', params: { id } })}
        onOpenLibrary={(id) => void navigate({ to: '/media', search: { id } })}
      />
      <PublicationDrawer
        timezone={timezone}
        publicationId={openPublicationId ?? null}
        isOpen={openPublicationId !== undefined}
        onOpenChange={(open) => {
          if (!open) openPublication(undefined);
        }}
        destinationTitle={drawerDestination?.title}
        chatId={drawerDestination?.chatId}
      />
    </>
  );
}
