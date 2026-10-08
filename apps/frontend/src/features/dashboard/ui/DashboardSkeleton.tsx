import { DashboardLayout } from './DashboardLayout';

const ignore = () => {};

/** The dashboard while it loads: the real layout and panel headers with same-height skeleton rows. */
export function DashboardSkeleton({ zoneNote = '' }: { zoneNote?: string }) {
  return <DashboardLayout zoneNote={zoneNote} onOpenPublication={ignore} onNewPost={ignore} onOpenPosts={ignore} />;
}
