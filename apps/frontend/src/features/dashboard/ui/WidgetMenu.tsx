import type { DashboardWidget } from '@alexeev/contracts';
import { useMemo } from 'react';
import { Menu, type MenuEntry } from '../../../shared/ui';
import { move, resize, sameLayout, shiftInSequence } from '../model/layout-ops';
import type { WidgetAction } from '../model/use-layout-editor';
import { WIDGETS } from '../model/widget-catalog';
import { copy } from './copy';

type Props = {
  widget: DashboardWidget;
  draft: readonly DashboardWidget[];
  /** A phone moves widgets in the single column (earlier or later) and cannot resize them. */
  phone: boolean;
  onAction: (id: string, action: WidgetAction) => void;
};

/** The keyboard and screen-reader way to do everything the pointer does: move, resize, remove. */
export function WidgetMenu({ widget, draft, phone, onAction }: Props) {
  const items = useMemo<MenuEntry[]>(() => {
    const unchanged = (next: readonly DashboardWidget[]) => sameLayout(next, draft);
    const label = copy.edit.actions;
    const remove: MenuEntry = { id: 'remove', label: label.remove, icon: 'trash', tone: 'danger' };
    if (phone) {
      return [
        {
          id: 'move-up',
          label: copy.edit.phoneMoveUp,
          icon: 'arrow-up',
          isDisabled: unchanged(shiftInSequence(draft, widget.id, -1))
        },
        {
          id: 'move-down',
          label: copy.edit.phoneMoveDown,
          icon: 'arrow-down',
          isDisabled: unchanged(shiftInSequence(draft, widget.id, 1))
        },
        remove
      ];
    }
    return [
      {
        id: 'move-left',
        label: label['move-left'],
        icon: 'chevron-left',
        isDisabled: unchanged(move(draft, widget.id, 'left'))
      },
      {
        id: 'move-right',
        label: label['move-right'],
        icon: 'chevron-right',
        isDisabled: unchanged(move(draft, widget.id, 'right'))
      },
      { id: 'move-up', label: label['move-up'], icon: 'arrow-up', isDisabled: unchanged(move(draft, widget.id, 'up')) },
      {
        id: 'move-down',
        label: label['move-down'],
        icon: 'arrow-down',
        isDisabled: unchanged(move(draft, widget.id, 'down'))
      },
      { id: 'wider', label: label.wider, isDisabled: unchanged(resize(draft, widget.id, 'wider')) },
      { id: 'narrower', label: label.narrower, isDisabled: unchanged(resize(draft, widget.id, 'narrower')) },
      { id: 'taller', label: label.taller, isDisabled: unchanged(resize(draft, widget.id, 'taller')) },
      { id: 'shorter', label: label.shorter, isDisabled: unchanged(resize(draft, widget.id, 'shorter')) },
      remove
    ];
  }, [draft, phone, widget.id]);
  return (
    <Menu
      label={copy.edit.menuLabel(WIDGETS[widget.type].title)}
      items={items}
      triggerSize="target"
      onAction={(id) => onAction(widget.id, id as WidgetAction)}
    />
  );
}
