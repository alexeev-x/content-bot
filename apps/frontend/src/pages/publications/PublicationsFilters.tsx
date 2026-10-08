import { useState } from 'react';
import { publicationCopy } from '../../features/publications';
import styles from './PublicationsPage.module.css';
import { FilterButton, FilterSheet, PhoneToolbar, PhoneToolbarSearch, SearchField, Select } from '../../shared/ui';

const copy = publicationCopy.filters;

export type Order = 'asc' | 'desc';

export const orderOptions = [
  { id: 'desc', label: copy.sortNewest },
  { id: 'asc', label: copy.sortOldest }
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
  const [draft, setDraft] = useState<string>(defaultOrder);
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
          onPress={() => {
            setDraft(current);
            setOpen(true);
          }}
        />
      </PhoneToolbar>
      <FilterSheet
        isOpen={open}
        onOpenChange={setOpen}
        count={0}
        title={copy.sort}
        onReset={() => setDraft(defaultOrder)}
        onApply={() => {
          onOrderChange(draft === defaultOrder ? undefined : (draft as Order));
          setOpen(false);
        }}
      >
        <Select label={copy.sort} options={orderOptions} value={draft} onChange={setDraft} />
      </FilterSheet>
    </>
  );
}
