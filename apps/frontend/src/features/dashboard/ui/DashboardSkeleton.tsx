import { useState } from 'react';
import { initialWidgets } from '../model/use-dashboard-layout';
import { DashboardLayout } from './DashboardLayout';

const ignore = () => {};

/**
 * The dashboard before the session exists: the cached layout (the default when there is none) with each widget's
 * skeleton. It starts no request, so no call leaves without a token.
 */
export function DashboardSkeleton({ zoneNote = '' }: { zoneNote?: string }) {
  const [widgets] = useState(initialWidgets);
  return (
    <DashboardLayout
      widgets={widgets}
      loading
      zoneNote={zoneNote}
      env={{
        view: undefined,
        services: undefined,
        skeleton: true,
        onOpenPublication: ignore,
        onNewPost: ignore,
        onOpenPosts: ignore,
        onOpenPost: ignore,
        onAddChannel: ignore,
        onQuickNewPost: ignore,
        onQuickPublish: ignore,
        onQuickAddChannel: ignore
      }}
    />
  );
}
