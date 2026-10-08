import type { IncidentKind } from '@alexeev/contracts';
import { useState } from 'react';
import { FilterButton, FilterSheet, PhoneToolbar, Select, type SelectOption } from '../../../shared/ui';
import { copy } from './copy';
import styles from './Incidents.module.css';

const ALL = 'all';
const KIND_OPTIONS: readonly SelectOption[] = [
  { id: ALL, label: copy.filters.all },
  { id: 'publish_unknown', label: copy.filters.unknown },
  { id: 'publish_failed', label: copy.filters.failed }
];

type Props = {
  kind: IncidentKind | undefined;
  narrow: boolean;
  isDisabled?: boolean;
  onKindChange: (kind: IncidentKind | undefined) => void;
};

const toKind = (id: string): IncidentKind | undefined =>
  id === 'publish_unknown' || id === 'publish_failed' ? id : undefined;

/** One filter, «Тип»: an inline select on desktop, «Фильтры (N)» with a sheet on a phone. */
export function IncidentFilters({ kind, narrow, isDisabled = false, onKindChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(ALL);
  if (!narrow) {
    return (
      <div className={styles.toolbar}>
        <Select
          inlineLabel
          label={copy.filters.kind}
          options={KIND_OPTIONS}
          value={kind ?? ALL}
          onChange={(id) => onKindChange(toKind(id))}
          isDisabled={isDisabled}
        />
      </div>
    );
  }
  return (
    <>
      <PhoneToolbar>
        <FilterButton
          count={kind ? 1 : 0}
          isDisabled={isDisabled}
          onPress={() => {
            setDraft(kind ?? ALL);
            setOpen(true);
          }}
        />
      </PhoneToolbar>
      <FilterSheet
        isOpen={open}
        onOpenChange={setOpen}
        count={draft === ALL ? 0 : 1}
        onReset={() => setDraft(ALL)}
        onApply={() => {
          onKindChange(toKind(draft));
          setOpen(false);
        }}
      >
        <Select label={copy.filters.kind} options={KIND_OPTIONS} value={draft} onChange={setDraft} />
      </FilterSheet>
    </>
  );
}
