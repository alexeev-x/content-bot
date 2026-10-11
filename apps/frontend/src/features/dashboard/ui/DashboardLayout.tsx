import type { DashboardWidget } from '@alexeev/contracts';
import type { ReactNode } from 'react';
import { PHONE_QUERY } from '../model/geometry';
import { useNow } from '../model/use-now';
import { useMediaQuery, VisuallyHidden } from '../../../shared/ui';
import { copy } from './copy';
import styles from './Dashboard.module.css';
import { DateChip } from './DateChip';
import { WidgetBody } from './WidgetBody';
import { WidgetGrid } from './WidgetGrid';
import type { WidgetEnv } from './widget-env';

type LayoutProps = {
  widgets: readonly DashboardWidget[];
  /** Everything the widgets need except the clock and the viewport, which the layout owns. */
  env: Omit<WidgetEnv, 'now' | 'phone'>;
  /** The `/dashboard` day is still loading: the root says so and its widgets draw skeletons. */
  loading: boolean;
  banner?: ReactNode;
  zoneNote: string;
  defaultOverview?: boolean;
};

/**
 * One layout for loading and loaded: the skeleton is this same tree without data, so nothing jumps when the
 * response arrives (docs/design/README.md §6). Each widget sits at its saved cell; on a phone they stack in order.
 */
export function DashboardLayout({ widgets, env, loading, banner, zoneNote, defaultOverview = false }: LayoutProps) {
  const phone = useMediaQuery(PHONE_QUERY);
  const now = useNow();
  const full: WidgetEnv = { ...env, now, phone };
  return (
    <div className={styles.root} aria-busy={loading || undefined}>
      {loading ? (
        <VisuallyHidden>
          <output>{copy.loading}</output>
        </VisuallyHidden>
      ) : null}
      {banner}
      <DateChip placement="below" zoneNote={zoneNote} timezone={env.timezone} />
      <WidgetGrid widgets={widgets} phone={phone} defaultOverview={defaultOverview} label={copy.edit.gridLabel}>
        {(widget) => <WidgetBody widget={widget} env={full} />}
      </WidgetGrid>
    </div>
  );
}
