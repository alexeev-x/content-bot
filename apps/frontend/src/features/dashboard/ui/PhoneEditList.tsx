import type { DashboardWidget } from '@alexeev/contracts';
import { GridList, GridListItem, useDragAndDrop, Button as AriaButton } from 'react-aria-components';
import { Icon } from '../../../shared/ui';
import { sequence } from '../model/layout-ops';
import type { WidgetAction } from '../model/use-layout-editor';
import { WIDGETS } from '../model/widget-catalog';
import { copy } from './copy';
import styles from './DashboardEditor.module.css';
import { WidgetMenu } from './WidgetMenu';

type Props = {
  widgets: readonly DashboardWidget[];
  /** The new order of widget ids after a drag (mouse, touch, keyboard or screen reader). */
  onReorder: (orderedIds: readonly string[]) => void;
  onAction: (id: string, action: WidgetAction) => void;
};

/**
 * Phone and Mini App edit mode: the widgets as one reorderable list (the order of the single column). Drag with
 * the handle, or use the row menu (earlier, later, remove); widths and heights are not editable here.
 */
export function PhoneEditList({ widgets, onReorder, onAction }: Props) {
  const items = sequence(widgets);
  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) => [...keys].map((key) => ({ 'text/plain': String(key) })),
    onReorder(event) {
      if (event.target.dropPosition === 'on') return;
      const ids = items.map((item) => item.id);
      const moving = ids.filter((id) => event.keys.has(id));
      const rest = ids.filter((id) => !event.keys.has(id));
      const at = rest.indexOf(String(event.target.key));
      if (at < 0) return;
      rest.splice(event.target.dropPosition === 'before' ? at : at + 1, 0, ...moving);
      onReorder(rest);
    }
  });
  return (
    <>
      <p className={styles.phoneHint}>{copy.edit.phoneHint}</p>
      <GridList
        aria-label={copy.edit.phoneList}
        items={items}
        dragAndDropHooks={dragAndDropHooks}
        className={styles.phoneList}
      >
        {(widget) => {
          const def = WIDGETS[widget.type];
          return (
            <GridListItem id={widget.id} textValue={def.title} className={styles.phoneRow}>
              <AriaButton slot="drag" className={styles.phoneGrip} aria-label={`${copy.edit.handle}: ${def.title}`}>
                <Icon name="grip" size={20} />
              </AriaButton>
              <Icon name={def.icon} size={18} className={styles.kind} />
              <span className={styles.title}>{def.title}</span>
              <WidgetMenu widget={widget} draft={widgets} phone onAction={onAction} />
            </GridListItem>
          );
        }}
      </GridList>
    </>
  );
}
