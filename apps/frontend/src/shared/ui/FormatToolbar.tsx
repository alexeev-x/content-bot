import { useLayoutEffect, useRef, useState } from 'react';
import { Button, Separator, ToggleButton, Toolbar } from 'react-aria-components';
import { Icon, type IconName } from './Icon';
import { Menu } from './Menu';
import styles from './FormatToolbar.module.css';

export type FormatToolbarItem = {
  id: string;
  icon: IconName;
  /** Accessible name and tooltip text of the icon button («Жирный», «Отменить»). */
  label: string;
  /** `toggle` shows its on/off state (bold, italic); `action` just fires (undo, insert emoji). */
  kind?: 'toggle' | 'action';
  isSelected?: boolean;
  isDisabled?: boolean;
  /** A thin divider is drawn before this item (between groups). */
  separatorBefore?: boolean;
  /** Items marked `end` sit at the right edge, after the free space (emoji, undo, redo). */
  end?: boolean;
};

type Props = {
  /** Names the toolbar («Форматирование»). Arrow keys move between buttons, Tab leaves the toolbar (APG toolbar). */
  label: string;
  items: readonly FormatToolbarItem[];
  onAction: (id: string) => void;
  /** Name of the «more» menu that takes the items that do not fit. */
  overflowLabel: string;
  /** `compact`: 32 px buttons with 2 px gaps on every device, so 7 fit a 375 px phone (targets stay above the 24 px WCAG 2.5.8 minimum and never overlap). */
  density?: 'comfortable' | 'compact';
};

const SEPARATOR = 9;

/** How many leading items fit in `width`, keeping room for the overflow button when something is cut. */
function fitCount(
  items: readonly FormatToolbarItem[],
  width: number,
  button: number,
  gap: number,
  separator: number
): number {
  const cost = (count: number, withMore: boolean) => {
    let total = 0;
    for (let i = 0; i < count; i++) {
      total += button + (i > 0 ? gap : 0);
      if (i > 0 && items[i]?.separatorBefore) total += separator;
    }
    return total + (withMore ? gap + button : 0);
  };
  if (cost(items.length, false) <= width) return items.length;
  let count = items.length - 1;
  while (count > 1 && cost(count, true) > width) count -= 1;
  return count;
}

/** Rich-text button group: toggles and actions with dividers, and a «more» menu for what does not fit the width. */
export function FormatToolbar({ label, items, onAction, overflowLabel, density = 'comfortable' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(items.length);
  const compact = density === 'compact';
  const gap = compact ? 2 : 4;
  const separator = compact ? 3 : SEPARATOR;

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const width = element.clientWidth;
      if (width === 0) {
        setVisible(items.length);
        return;
      }
      const first = element.querySelector<HTMLElement>('[data-toolbar-button]');
      setVisible(fitCount(items, width, first?.offsetWidth || 32, gap, separator));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [items, gap, separator]);

  const shown = items.slice(0, Math.min(visible, items.length));
  const hidden = items.slice(shown.length);
  const firstEnd = shown.findIndex((item) => item.end);

  return (
    <Toolbar ref={ref} aria-label={label} className={styles.toolbar} data-density={density}>
      {shown.map((item, index) => {
        const separator = index > 0 && index !== firstEnd && item.separatorBefore;
        return (
          <span key={item.id} className={styles.slot} data-end={item.end || undefined}>
            {index === firstEnd && index > 0 ? <span className={styles.spacer} /> : null}
            {separator ? <Separator orientation="vertical" className={styles.separator} /> : null}
            {item.kind === 'toggle' ? (
              <ToggleButton
                aria-label={item.label}
                data-toolbar-button=""
                isSelected={item.isSelected ?? false}
                isDisabled={item.isDisabled}
                onChange={() => onAction(item.id)}
                className={styles.button}
              >
                <Icon name={item.icon} size={18} />
              </ToggleButton>
            ) : (
              <Button
                aria-label={item.label}
                data-toolbar-button=""
                isDisabled={item.isDisabled}
                onPress={() => onAction(item.id)}
                className={styles.button}
              >
                <Icon name={item.icon} size={18} />
              </Button>
            )}
          </span>
        );
      })}
      {hidden.length > 0 ? (
        <span className={styles.slot} data-more="">
          {firstEnd === -1 ? <span className={styles.spacer} /> : null}
          <Menu
            label={overflowLabel}
            items={hidden.map((item) => ({
              id: item.id,
              label: item.label,
              icon: item.icon,
              isDisabled: item.isDisabled
            }))}
            onAction={onAction}
          />
        </span>
      ) : null}
    </Toolbar>
  );
}
