import { Menu as AriaMenu, MenuItem, MenuTrigger, Popover, type Selection } from 'react-aria-components';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { IconButton } from './IconButton';
import styles from './Menu.module.css';

export type MenuEntry = {
  id: string;
  label: string;
  icon?: IconName;
  tone?: 'danger';
  isDisabled?: boolean;
};

type Props = {
  /** Accessible name of the trigger and the menu. */
  label: string;
  items: readonly MenuEntry[];
  /** With a text the trigger is a labelled button with a chevron; without it, a «more» icon button. */
  triggerText?: string;
  triggerIcon?: IconName;
  onAction?: (id: string) => void;
  /** Single selection renders a check (theme, view mode); `none` is a plain action menu. */
  selectionMode?: 'none' | 'single';
  selectedId?: string;
  onSelect?: (id: string) => void;
  placement?: 'bottom start' | 'bottom end';
};

/** APG menu button: Enter, Space or ArrowDown opens, arrows move, type-ahead works, Esc closes and returns focus. */
export function Menu({
  label,
  items,
  triggerText,
  triggerIcon = 'more',
  onAction,
  selectionMode = 'none',
  selectedId,
  onSelect,
  placement = 'bottom end'
}: Props) {
  const selected: Selection | undefined =
    selectionMode === 'single' ? new Set(selectedId ? [selectedId] : []) : undefined;
  return (
    <MenuTrigger>
      {triggerText ? (
        <Button variant="secondary" size="sm" aria-label={label}>
          {triggerText}
          <Icon name="chevron-down" size={16} />
        </Button>
      ) : (
        <IconButton label={label} icon={triggerIcon} showTooltip={false} />
      )}
      <Popover placement={placement} offset={6} className={styles.popover}>
        <AriaMenu
          aria-label={label}
          className={styles.menu}
          selectionMode={selectionMode}
          selectedKeys={selected}
          disallowEmptySelection={selectionMode === 'single'}
          onSelectionChange={(keys) => {
            const first = keys === 'all' ? undefined : [...keys][0];
            if (first !== undefined) onSelect?.(String(first));
          }}
          onAction={(key) => onAction?.(String(key))}
        >
          {items.map((item) => (
            <MenuItem
              key={item.id}
              id={item.id}
              textValue={item.label}
              isDisabled={item.isDisabled}
              data-tone={item.tone}
              className={styles.item}
            >
              {item.icon ? <Icon name={item.icon} size={18} /> : null}
              <span className={styles.itemLabel}>{item.label}</span>
              {selectionMode === 'single' ? <Icon name="check" size={16} className={styles.check} /> : null}
            </MenuItem>
          ))}
        </AriaMenu>
      </Popover>
    </MenuTrigger>
  );
}
