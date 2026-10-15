import { useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useDocumentTitle } from '../app/use-document-title';
import { AudienceSummary, TopSummary } from '../features/content-analytics';
import { Dashboard, DateChip, useDashboardQuery, type PageBindings } from '../features/dashboard';
import { destinationsInfiniteQueryOptions } from '../features/destinations';
import { MediaPanel, MediaThumb } from '../features/media';
import { PublicationDrawer, publicationQueryOptions } from '../features/publications';
import { useOwnerTimezone } from '../features/owner-settings';
import { utcOffsetLabel } from '../shared/lib/owner-timezone';
import { useNow } from '../shared/lib/use-now';
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
  const zoneNote = `${timezone}, ${utcOffsetLabel(now, timezone)}`;
  const [openMedia, setOpenMedia] = useState<{ id: string; fileName: string } | null>(null);
  const phone = useMediaQuery('(max-width: 859px)');
  const destinations = useInfiniteQuery(destinationsInfiniteQueryOptions({ enabled: true }));
  const destinationList = destinations.data?.pages.flatMap((page) => page.items);
  const openPublication = (id: string | undefined) =>
    onOpenPublicationChange
      ? onOpenPublicationChange(id)
      : id && void navigate({ to: '/publications', search: { id } });

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
      audience: <AudienceSummary />,
      top: <TopSummary onOpen={(id) => void navigate({ to: '/analytics', search: { id } })} />,
      onOpenAll: () => void navigate({ to: '/analytics' })
    }
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
