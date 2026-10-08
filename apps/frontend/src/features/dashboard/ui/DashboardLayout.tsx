import type { ReactNode } from 'react';
import { useMediaQuery, VisuallyHidden } from '../../../shared/ui';
import { useNow } from '../model/use-now';
import { AttentionPanel } from './AttentionPanel';
import { copy } from './copy';
import styles from './Dashboard.module.css';
import { DateChip } from './DateChip';
import { Kpis } from './Kpis';
import { RecentPanel, TodayPanel, UpcomingPanel } from './PublicationPanels';
import { SystemPanel } from './SystemPanel';
import type { DashboardView } from './view-model';

/** The phone layout: the single breakpoint of the shell (tab bar, one column). */
export const NARROW_QUERY = '(max-width: 859px)';

type LayoutProps = {
  /** Undefined while loading: every panel renders its header and same-height skeleton rows. */
  view?: DashboardView;
  banner?: ReactNode;
  zoneNote: string;
  onOpenPublication: (publicationId: string) => void;
  onNewPost: () => void;
  onOpenPosts: () => void;
};

/**
 * One layout for loading and loaded: the skeleton is this same tree without data, so nothing jumps when the
 * response arrives (docs/design/README.md §6). Main row: attention and today left, system and upcoming right;
 * the last sent publications run full width below. Phone: one column in the order of the cells below.
 */
export function DashboardLayout({ view, banner, zoneNote, onOpenPublication, onNewPost, onOpenPosts }: LayoutProps) {
  const narrow = useMediaQuery(NARROW_QUERY);
  const now = useNow();
  const dashboard = view?.dashboard;
  return (
    <div className={styles.root} aria-busy={view === undefined || undefined}>
      {view === undefined ? (
        <VisuallyHidden>
          <output>{copy.loading}</output>
        </VisuallyHidden>
      ) : null}
      {banner}
      <DateChip placement="below" zoneNote={zoneNote} />
      <Kpis view={view} now={now} />

      <div className={styles.layout}>
        <div className={styles.main}>
          <AttentionPanel
            rows={view?.rows}
            total={view?.attentionCount ?? 0}
            checking={view?.checking ?? false}
            narrow={narrow}
            now={now}
            onOpenPublication={onOpenPublication}
          />
          <TodayPanel
            items={dashboard?.today}
            total={dashboard?.todayTotal ?? 0}
            narrow={narrow}
            now={now}
            onOpenPublication={onOpenPublication}
            onNewPost={onNewPost}
          />
          <SystemPanel services={view?.services} />
          <UpcomingPanel
            items={dashboard?.upcoming}
            narrow={narrow}
            now={now}
            onOpenPublication={onOpenPublication}
            onCreate={onOpenPosts}
          />
          <RecentPanel items={dashboard?.recentSent} narrow={narrow} now={now} onOpenPublication={onOpenPublication} />
        </div>
      </div>
    </div>
  );
}
