import { publicationStatusSchema, type DestinationDto, type PublicationStatus } from '@alexeev/contracts';
import { useState } from 'react';
import { publicationCopy } from '../../features/publications';
import { ru } from '../../shared/lib/ru';
import {
  ColumnFilter,
  FilterButton,
  FilterSheet,
  PhoneToolbar,
  PhoneToolbarSearch,
  Radio,
  RadioGroup,
  SearchField,
  Select
} from '../../shared/ui';

const ALL = 'all';
const copy = publicationCopy.filters;
const FILTERABLE: readonly PublicationStatus[] = publicationStatusSchema.options.filter(
  (status) => status !== 'preparing'
);

export type Order = 'asc' | 'desc';

export const statusOptions = [
  { id: ALL, label: copy.allStatuses },
  ...FILTERABLE.map((item) => ({ id: item, label: ru.status[item] }))
];
export const channelOptionsOf = (destinations: readonly DestinationDto[]) => [
  { id: ALL, label: copy.allChannels },
  ...destinations.map((item) => ({ id: item.id, label: item.title }))
];
const orderOptions = [
  { id: 'desc', label: copy.sortNewest },
  { id: 'asc', label: copy.sortOldest }
];

type SearchProps = { q: string | undefined; onChange: (q: string | undefined) => void };

/** Desktop: the search sits in the «Пост» column header and is sent on Enter, so a keystroke is not a request. */
export function SearchFilter({ q, onChange }: SearchProps) {
  return (
    <ColumnFilter label={copy.searchFilter} icon="search" isActive={q !== undefined}>
      <SearchField
        key={q ?? ''}
        label={copy.searchField}
        placeholder={copy.searchHint}
        defaultValue={q ?? ''}
        // The owner opened the search popover on purpose: its only field takes focus.
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        onSubmit={(value) => onChange(value.trim() || undefined)}
        onClear={() => onChange(undefined)}
      />
    </ColumnFilter>
  );
}

type PickProps = { label: string; filterLabel: string; value: string | undefined; options: readonly { id: string; label: string }[]; onChange: (value: string | undefined) => void };

/** Desktop: one-of-many filter in a column header (status, channel). */
export function PickFilter({ label, filterLabel, value, options, onChange }: PickProps) {
  return (
    <ColumnFilter label={filterLabel} isActive={value !== undefined}>
      <RadioGroup label={label} value={value ?? ALL} onChange={(id) => onChange(id === ALL ? undefined : id)}>
        {options.map((option) => (
          <Radio key={option.id} value={option.id}>
            {option.label}
          </Radio>
        ))}
      </RadioGroup>
    </ColumnFilter>
  );
}

type PhoneProps = {
  q: string | undefined;
  status: PublicationStatus | undefined;
  channel: string | undefined;
  order: Order | undefined;
  defaultOrder: Order;
  destinations: readonly DestinationDto[];
  isLoading: boolean;
  onQueryChange: (q: string | undefined) => void;
  onApply: (next: { status: PublicationStatus | undefined; channel: string | undefined; order: Order | undefined }) => void;
};

/** Phone: search plus «Фильтры (N)»; status, channel and the sort are applied together from the sheet. */
export function PhoneFilters({
  q,
  status,
  channel,
  order,
  defaultOrder,
  destinations,
  isLoading,
  onQueryChange,
  onApply
}: PhoneProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ status: ALL, channel: ALL, order: defaultOrder as string });
  const count = (status ? 1 : 0) + (channel ? 1 : 0) + (order ? 1 : 0);
  const draftCount =
    (draft.status !== ALL ? 1 : 0) + (draft.channel !== ALL ? 1 : 0) + (draft.order !== defaultOrder ? 1 : 0);
  return (
    <>
      <PhoneToolbar>
        <PhoneToolbarSearch>
          <SearchField
            key={q ?? ''}
            label={copy.searchLabel}
            placeholder={copy.phoneSearch}
            defaultValue={q ?? ''}
            isDisabled={isLoading}
            onSubmit={(value) => onQueryChange(value.trim() || undefined)}
            onClear={() => onQueryChange(undefined)}
          />
        </PhoneToolbarSearch>
        <FilterButton
          count={count}
          isDisabled={isLoading}
          onPress={() => {
            setDraft({ status: status ?? ALL, channel: channel ?? ALL, order: order ?? defaultOrder });
            setOpen(true);
          }}
        />
      </PhoneToolbar>
      <FilterSheet
        isOpen={open}
        onOpenChange={setOpen}
        count={draftCount}
        onReset={() => setDraft({ status: ALL, channel: ALL, order: defaultOrder })}
        onApply={() => {
          onApply({
            status: draft.status === ALL ? undefined : (draft.status as PublicationStatus),
            channel: draft.channel === ALL ? undefined : draft.channel,
            order: draft.order === defaultOrder ? undefined : (draft.order as Order)
          });
          setOpen(false);
        }}
      >
        <Select
          label={copy.status}
          options={statusOptions}
          value={draft.status}
          onChange={(value) => setDraft({ ...draft, status: value })}
        />
        <Select
          label={copy.channel}
          options={channelOptionsOf(destinations)}
          value={draft.channel}
          onChange={(value) => setDraft({ ...draft, channel: value })}
        />
        <Select
          label={copy.sort}
          options={orderOptions}
          value={draft.order}
          onChange={(value) => setDraft({ ...draft, order: value })}
        />
      </FilterSheet>
    </>
  );
}

export { orderOptions };
