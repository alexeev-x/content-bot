import type { DashboardWidget } from '@alexeev/contracts';
import { Icon, Skeleton } from '../../../shared/ui';
import { WIDGETS } from '../model/widget-catalog';
import type { WidgetAction } from '../model/use-layout-editor';
import { copy } from './copy';
import styles from './DashboardEditor.module.css';
import { WidgetMenu } from './WidgetMenu';

/** The class react-grid-layout looks for to start a drag; a plain name because the grid takes a CSS selector. */
export const DRAG_HANDLE_CLASS = 'dashboard-drag-handle';

type Props = {
  widget: DashboardWidget;
  draft: readonly DashboardWidget[];
  /** Without it the card is the static stand-in shown while the grid chunk loads. */
  onAction?: (id: string, action: WidgetAction) => void;
};

/**
 * A widget while editing: a light placeholder instead of live data (no request, no flicker while it is dragged),
 * a visible drag handle, a menu with every operation, and the size. The 44 px resize corner is added by the grid.
 */
export function EditCard({ widget, draft, onAction }: Props) {
  const def = WIDGETS[widget.type];
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
    <div className={styles.card} role="group" aria-label={def.title}>
      <div className={styles.head}>
        <span className={`${styles.grip} ${DRAG_HANDLE_CLASS}`} aria-hidden="true" title={copy.edit.handle}>
          <Icon name="grip" size={20} />
        </span>
        <Icon name={def.icon} size={18} className={styles.kind} />
        <span className={styles.title}>{def.title}</span>
        {onAction ? <WidgetMenu widget={widget} draft={draft} phone={false} onAction={onAction} /> : null}
      </div>
      <div className={styles.preview} aria-hidden="true">
        <Skeleton height={12} width="70%" />
        <Skeleton height={12} width="45%" />
        <Skeleton height={12} width="60%" />
      </div>
      <span className={styles.size}>{copy.edit.sizeCaption(widget.w, widget.h)}</span>
    </div>
  );
}
