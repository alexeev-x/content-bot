import { useState } from 'react';
import { publicationCopy } from '../../features/publications';
import styles from './PublicationsPage.module.css';
import { FilterButton, PhoneToolbar, PhoneToolbarSearch, SearchField, SortSheet } from '../../shared/ui';

const copy = publicationCopy.filters;

export type Order = 'asc' | 'desc';

const orderOptions = [
  { id: 'desc', label: copy.sortNewest },
  { id: 'asc', label: copy.sortOldest }
];

export const periodOptions = [
  { id: 'all', label: 'За всё время' },
  { id: 'today', label: 'Сегодня' },
  { id: '7d', label: '7 дней' },
  { id: '30d', label: '30 дней' }
];

/**
 * Desktop: an always-visible search field in the panel header (owner, 08.10.2026). The page filters the loaded
 * rows while typing: a keystroke is not a request.
 */
export function SearchFilter({ query, onChange }: { query: string; onChange: (query: string) => void }) {
  return (
    <span className={styles.headerSearch}>
      <SearchField label={copy.searchLabel} placeholder={copy.searchHint} value={query} onChange={onChange} />
    </span>
  );
}

type PhoneProps = {
  query: string;
  onQueryChange: (query: string) => void;
  /** `undefined` is the default order of the tab. */
  order: Order | undefined;
  defaultOrder: Order;
  isLoading: boolean;
  onOrderChange: (order: Order | undefined) => void;
};

/** Phone: the same search over the loaded rows plus «Сортировка», a sheet that holds only the order. */
export function PhoneFilters({ query, onQueryChange, order, defaultOrder, isLoading, onOrderChange }: PhoneProps) {
  const [open, setOpen] = useState(false);
  const current = order ?? defaultOrder;
  return (
    <>
      <PhoneToolbar>
        <PhoneToolbarSearch>
          <SearchField
            label={copy.searchLabel}
            placeholder={copy.phoneSearch}
            value={query}
            isDisabled={isLoading}
            onChange={onQueryChange}
          />
        </PhoneToolbarSearch>
        <FilterButton
          count={0}
          sort={{
            label: copy.sort,
            value: `${publicationCopy.list.columns.time} ${current === 'asc' ? '↑' : '↓'}`,
            spoken: orderOptions.find((option) => option.id === current)?.label ?? ''
          }}
          isDisabled={isLoading}
          onPress={() => setOpen(true)}
        />
      </PhoneToolbar>
      <SortSheet
        isOpen={open}
        onOpenChange={setOpen}
        title={copy.sort}
        options={orderOptions}
        value={current}
        onChange={(next) => onOrderChange(next === defaultOrder ? undefined : (next as Order))}
      />
    </>
  );
}
