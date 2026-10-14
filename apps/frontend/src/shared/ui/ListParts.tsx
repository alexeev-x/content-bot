import type { ReactNode } from 'react';
import { Button } from './Button';
import { Drawer } from './Drawer';
import styles from './ListParts.module.css';
import { PanelList } from './Panel';
import { Radio, RadioGroup } from './RadioGroup';
import { Skeleton } from './Skeleton';

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

type SortSheetProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  options: readonly { id: string; label: string }[];
  value: string;
  /** Applies at once: one tap on an order picks it and closes the sheet (owner, 14.10.2026). */
  onChange: (value: string) => void;
};

/** Phone sort sheet: the orders as a list, no second dropdown and no «Показать результаты». */
export function SortSheet({ isOpen, onOpenChange, title, options, value, onChange }: SortSheetProps) {
  return (
    <Drawer variant="bottom" title={title} isOpen={isOpen} onOpenChange={onOpenChange}>
      <RadioGroup
        label={title}
        labelHidden
        variant="rows"
        value={value}
        onChange={(next) => {
          onChange(next);
          onOpenChange(false);
        }}
      >
        {options.map((option) => (
          <Radio key={option.id} value={option.id}>
            {option.label}
          </Radio>
        ))}
      </RadioGroup>
    </Drawer>
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
