import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useDocumentTitle } from '../app/use-document-title';
import { useBotCheck } from '../features/bot';
import {
  Dashboard,
  DateChip,
  LayoutActions,
  useDashboardQuery,
  useLayoutEditing,
  type ChannelRow,
  type PageBindings,
  type ServiceRow
} from '../features/dashboard';
import { destinationsInfiniteQueryOptions } from '../features/destinations';
import { MediaPanel, MediaThumb } from '../features/media';
import { PublicationDrawer, publicationQueryOptions } from '../features/publications';
import { useOwnerTimezone } from '../features/owner-settings';
import { ownerDayRange, utcOffsetLabel } from '../shared/lib/owner-timezone';
import { useNow } from '../shared/lib/use-now';
import { checkWord, isSwitchedOff, useServiceChecks } from '../features/system-health';
import { ru } from '../shared/lib/ru';
import { Button, PageHeader, useMediaQuery } from '../shared/ui';

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
  const service = useServiceChecks();
  const bot = useBotCheck();
  const checks = [...service.checks, bot];
  const zoneNote = `${timezone}, ${utcOffsetLabel(now, timezone)}`;
  const layout = useLayoutEditing();
  const [openMedia, setOpenMedia] = useState<{ id: string; fileName: string } | null>(null);
  const phone = useMediaQuery('(max-width: 859px)');
  const destinations = useInfiniteQuery(destinationsInfiniteQueryOptions({ enabled: true }));
  const destinationList = destinations.data?.pages.flatMap((page) => page.items);
  const botTone: ChannelRow['tone'] = bot.tone === 'ok' ? 'ok' : bot.tone === 'loading' ? 'muted' : 'warn';
  const channels: ChannelRow[] | undefined = destinationList?.map((destination) => ({
    id: destination.id,
    title: destination.title,
    tone: botTone
  }));
  const openPublication = (id: string | undefined) =>
    onOpenPublicationChange
      ? onOpenPublicationChange(id)
      : id && void navigate({ to: '/publications', search: { id } });
  const services: ServiceRow[] = checks.map((check) => ({
    id: check.id,
    name: check.name,
    tone: check.tone,
    word: checkWord(check),
    off: isSwitchedOff(check),
    title: check.summary,
    ...(check.action ? { action: check.action } : {})
  }));

  const bindings: PageBindings = {
    query: dashboard,
    checks,
    services,
    zoneNote,
    timezone,
    onOpenPublication: (id) => openPublication(id),
    onOpenDay: (day) => void navigate({ to: '/publications', search: { from: day.from, to: day.to } }),
    onNewPost: () => void navigate({ to: '/posts/new' }),
    onPublishDraft: (id) => void navigate({ to: '/posts/$id/publish', params: { id } }),
    onOpenToday: () => {
      const day = ownerDayRange(now, timezone);
      void navigate({ to: '/publications', search: { from: day.from, to: day.to } });
    },
    onOpenErrors: () => void navigate({ to: '/publications', search: { view: 'errors' } }),
    onOpenPost: (id) => void navigate({ to: '/posts/$id', params: { id } }),
    onOpenMedia: (media) => setOpenMedia(media),
    renderMediaPreview: (media) => <MediaThumb mediaId={media.id} fileName={media.fileName} />,
    channels,
    layout
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
        description={ru.dashboard.description}
        actions={
          layout.editing ? (
            <LayoutActions editing={layout} />
          ) : (
            <>
              <DateChip placement="header" zoneNote={zoneNote} timezone={timezone} />
              <LayoutActions editing={layout}>
                {/* On a phone the tab bar's «+» creates a post: no second button on the page. */}
                {phone ? null : (
                  <Button icon="plus" onPress={() => void navigate({ to: '/posts/new' })}>
                    Новый пост
                  </Button>
                )}
              </LayoutActions>
            </>
          )
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
