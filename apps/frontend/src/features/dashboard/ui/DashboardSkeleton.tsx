import { DashboardLayout } from './DashboardLayout';

const ignore = () => {};

/** The dashboard before the session exists: every widget as its skeleton, and no request (no call leaves without a token). */
export function DashboardSkeleton({ zoneNote = '' }: { zoneNote?: string }) {
  return (
    <DashboardLayout
      loading
      zoneNote={zoneNote}
      env={{
        view: undefined,
        services: undefined,
        onOpenPublication: ignore,
        onNewPost: ignore,
        onOpenPosts: ignore
      }}
    />
  );
}
