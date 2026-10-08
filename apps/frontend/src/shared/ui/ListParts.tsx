import type { ReactNode } from 'react';
import { Button } from './Button';
import { Drawer } from './Drawer';
import { Icon } from './Icon';
import styles from './ListParts.module.css';
import { PanelList } from './Panel';
import { Skeleton } from './Skeleton';
import { VisuallyHidden } from './VisuallyHidden';

/** Phone skeleton rows: the same 72 px geometry as RowCard (tile, title, status, meta), so data arrival shifts nothing. */
export function PhoneSkeletonRows({ count = 6, label }: { count?: number; label: string }) {
  return (
    <PanelList aria-label={label}>
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className={styles.skeletonCard}>
          <Skeleton width={44} height={44} />
          <div className={styles.skeletonBody}>
            <div className={styles.skeletonTop}>
              <Skeleton height={16} width={index % 2 ? '58%' : '72%'} />
              <Skeleton height={22} width={88} radius="var(--radius-pill)" />
            </div>
            <Skeleton height={12} width="44%" />
          </div>
        </li>
      ))}
    </PanelList>
  );
}

type FilterButtonProps = {
  count: number;
  onPress: () => void;
  isDisabled?: boolean;
  /** A sheet that holds only the sort: the button is named after it and shows the current order, not a count. */
  sort?: { label: string; value: string; spoken: string };
};

/** Phone: opens the filter sheet; the count shows how many filters are on. */
export function FilterButton({ count, onPress, isDisabled, sort }: FilterButtonProps) {
  return (
    <Button
      variant="secondary"
      icon="settings"
      onPress={onPress}
      isDisabled={isDisabled ?? false}
      {...(sort ? { 'aria-label': `${sort.label}: ${sort.spoken}` } : {})}
    >
      {sort
        ? // Phone width goes to the search field: the button shows only the order («Время ↓»); its full name is the
          // aria-label. Without a value it falls back to the word «Сортировка».
          (sort.value ?? sort.label)
        : `Фильтры${count > 0 ? ` (${count})` : ''}`}
    </Button>
  );
}

type SheetProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  /** Defaults to «Фильтры»; a sort-only sheet is named «Сортировка». */
  title?: string;
  onReset: () => void;
  onApply: () => void;
  children: ReactNode;
};

/** Phone filter sheet: every filter and the sort in one place, applied together. */
export function FilterSheet({
  isOpen,
  onOpenChange,
  count,
  title = 'Фильтры',
  onReset,
  onApply,
  children
}: SheetProps) {
  return (
    <Drawer
      variant="bottom"
      title={count > 0 ? `${title} (${count})` : title}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      footer={
        <>
          <Button variant="secondary" onPress={onReset}>
            Сбросить
          </Button>
          <Button onPress={onApply}>Показать результаты</Button>
        </>
      }
    >
      <div className={styles.sheetFields}>{children}</div>
    </Drawer>
  );
}

export type FilterChip = { id: string; label: string };

/** Echo of the applied filters: removable, shown only while a filter is on. Never navigation. */
export function AppliedChips({ chips, onRemove }: { chips: readonly FilterChip[]; onRemove: (id: string) => void }) {
  if (chips.length === 0) return null;
  return (
    <ul className={styles.chips} aria-label="Применённые фильтры">
      {chips.map((chip) => (
        <li key={chip.id}>
          <button type="button" className={styles.chip} onClick={() => onRemove(chip.id)}>
            {chip.label}
            <Icon name="x" size={14} />
            <VisuallyHidden>, убрать</VisuallyHidden>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Phone toolbar row of a Panel: search at the left, the filter button at the right. */
export function PhoneToolbar({ children }: { children: ReactNode }) {
  return <div className={styles.toolbar}>{children}</div>;
}

export function PhoneToolbarSearch({ children }: { children: ReactNode }) {
  return <div className={styles.toolbarSearch}>{children}</div>;
}

/** Panel footer line: the count at the left, one quiet action at the right. */
export function FooterLine({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <>
      <span aria-live="polite">{text}</span>
      {action}
    </>
  );
}
