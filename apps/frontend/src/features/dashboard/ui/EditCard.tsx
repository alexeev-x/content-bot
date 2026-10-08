import type { DashboardWidget } from '@alexeev/contracts';
import type { ReactNode } from 'react';
import { Icon } from '../../../shared/ui';
import { WIDGETS } from '../model/widget-catalog';
import type { WidgetAction } from '../model/use-layout-editor';
import { copy } from './copy';
import { EditingContext } from './size-toggle-context';
import styles from './DashboardEditor.module.css';
import { WidgetMenu } from './WidgetMenu';

/** The class react-grid-layout looks for to start a drag; a plain name because the grid takes a CSS selector. */
export const DRAG_HANDLE_CLASS = 'dashboard-drag-handle';

type Props = {
  widget: DashboardWidget;
  draft: readonly DashboardWidget[];
  /** The real widget content, drawn at the item's current size. It is inert: editing never activates it. */
  children: ReactNode;
  /** A dragged widget would swap places with this one if dropped now. */
  isDropTarget?: boolean;
  /** Without it the card is the static stand-in shown while the grid chunk loads. */
  onAction?: (id: string, action: WidgetAction) => void;
};

/**
 * A widget while editing: its real content (from the query cache) under an `inert` wrapper, so no link or button
 * in it can be pressed or take focus, and the edit chrome on top: a visible drag handle, the size, the menu with
 * every operation. The 44 px resize corner is added by the grid.
 */
export function EditCard({ widget, draft, children, isDropTarget, onAction }: Props) {
  const def = WIDGETS[widget.type];
  return (
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
    <div className={styles.card} role="group" aria-label={def.title} data-drop-target={isDropTarget || undefined}>
      <div className={styles.content} inert>
        <EditingContext value>{children}</EditingContext>
      </div>
      <div className={styles.chrome}>
        <span className={`${styles.grip} ${DRAG_HANDLE_CLASS}`} aria-hidden="true" title={copy.edit.handle}>
          <Icon name="grip" size={20} />
        </span>
        {onAction ? <WidgetMenu widget={widget} draft={draft} phone={false} onAction={onAction} /> : null}
      </div>
      <span className={styles.size}>{copy.edit.sizeCaption(widget.w, widget.h)}</span>
    </div>
  );
}
