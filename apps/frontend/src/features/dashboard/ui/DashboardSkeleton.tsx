import { readCachedLayout } from '../model/layout-cache';
import { DEFAULT_LAYOUT, fromServer } from '../model/widget-catalog';
import { DashboardLayout } from './DashboardLayout';

const ignore = () => {};

// The owner's last saved layout (a per-browser copy), so the skeleton already has the widgets the page will show.
function skeletonItems() {
  const cached = readCachedLayout();
  return cached ? fromServer(cached.widgets) : DEFAULT_LAYOUT;
}

/** The dashboard before the session exists: every widget as its skeleton, and no request (no call leaves without a token). */
export function DashboardSkeleton({
  zoneNote = '',
  timezone = 'Europe/Moscow'
}: {
  zoneNote?: string;
  timezone?: string;
}) {
  return (
    <DashboardLayout
      loading
      items={skeletonItems()}
      zoneNote={zoneNote}
      env={{
        view: undefined,
        services: undefined,
        week: undefined,
        drafts: undefined,
        timezone,
        onOpenPublication: ignore,
        onOpenDay: ignore,
        onNewPost: ignore,
        onPublishDraft: ignore,
        onOpenToday: ignore,
        onOpenErrors: ignore,
        channels: undefined
      }}
    />
  );
}
