import type { ReactNode } from 'react';
import { Skeleton } from '../../../shared/ui';
import styles from './Dashboard.module.css';
import { DashboardLayout } from './DashboardLayout';

const ignore = () => {};

/** The dashboard before the session exists: every widget as its skeleton, and no request (no call leaves without a token). */
export function DashboardSkeleton({
  zoneNote = '',
  timezone = 'Europe/Moscow',
  analytics
}: {
  zoneNote?: string;
  timezone?: string;
  /** The analytics widgets' own skeleton bodies, composed by the app (a feature never imports another). */
  analytics?: { latestYoutube: ReactNode; latestTiktok: ReactNode; trending: ReactNode };
}) {
  return (
    <DashboardLayout
      loading
      zoneNote={zoneNote}
      env={{
        view: undefined,
        week: undefined,
        drafts: undefined,
        timezone,
        onOpenPublication: ignore,
        onOpenDay: ignore,
        onNewPost: ignore,
        onPublishDraft: ignore,
        dayEvents: undefined,
        onOpenActivity: ignore,
        onOpenPost: ignore,
        // «ИИ расходы» keeps its place beside «Лента дня», so the row does not reflow when the page loads.
        ai: {
          badge: null,
          body: (
            <div aria-hidden="true" className={styles.aiSkeleton}>
              <Skeleton lines={6} height={20} />
            </div>
          )
        },
        ...(analytics ? { analytics: { ...analytics, onOpenAll: ignore } } : {})
      }}
    />
  );
}
