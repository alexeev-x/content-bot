import type { PublicationKind } from '@alexeev/contracts';
import { useState } from 'react';
import { PUBLICATION_KIND_LABELS, publicationCopy } from '../../features/publications';
import styles from './PublicationsPage.module.css';
import {
  Drawer,
  FilterButton,
  PhoneToolbar,
  PhoneToolbarSearch,
  Radio,
  RadioGroup,
  SearchField
} from '../../shared/ui';

const copy = publicationCopy.filters;

export type Order = 'asc' | 'desc';

const orderOptions = [
  { id: 'desc', label: copy.sortNewest },
  { id: 'asc', label: copy.sortOldest }
];

export const kindOptions = [
  { id: 'all', label: copy.allKinds },
  ...(Object.entries(PUBLICATION_KIND_LABELS) as [PublicationKind, string][]).map(([id, label]) => ({ id, label }))
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
  /** `undefined` is «За всё время». */
  period: string | undefined;
  /** `undefined` is «Все типы». */
  kind: string | undefined;
  isLoading: boolean;
  onOrderChange: (order: Order | undefined) => void;
  onPeriodChange: (period: string | undefined) => void;
  onKindChange: (kind: string | undefined) => void;
};

/** Phone: search over the loaded rows plus one «Фильтры» sheet that holds the order and the period. */
export function PhoneFilters({
  query,
  onQueryChange,
  order,
  defaultOrder,
  period,
  kind,
  isLoading,
  onOrderChange,
  onPeriodChange,
  onKindChange
}: PhoneProps) {
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
          count={(period === undefined ? 0 : 1) + (kind === undefined ? 0 : 1)}
          isDisabled={isLoading}
          onPress={() => setOpen(true)}
        />
      </PhoneToolbar>
      <Drawer variant="bottom" title="Фильтры" isOpen={open} onOpenChange={setOpen}>
        <RadioGroup
          label={copy.sort}
          variant="rows"
          value={current}
          onChange={(next) => onOrderChange(next === defaultOrder ? undefined : (next as Order))}
        >
          {orderOptions.map((option) => (
            <Radio key={option.id} value={option.id}>
              {option.label}
            </Radio>
          ))}
        </RadioGroup>
        <RadioGroup
          label="Период публикаций"
          variant="rows"
          value={period ?? 'all'}
          onChange={(next) => onPeriodChange(next === 'all' ? undefined : next)}
        >
          {periodOptions.map((option) => (
            <Radio key={option.id} value={option.id}>
              {option.label}
            </Radio>
          ))}
        </RadioGroup>
        <RadioGroup
          label={copy.kindLabel}
          variant="rows"
          value={kind ?? 'all'}
          onChange={(next) => onKindChange(next === 'all' ? undefined : next)}
        >
          {kindOptions.map((option) => (
            <Radio key={option.id} value={option.id}>
              {option.label}
            </Radio>
          ))}
        </RadioGroup>
      </Drawer>
    </>
  );
}
