import type { IncidentKind, IncidentState } from '@alexeev/contracts';
import { SegmentedControl, type SegmentOption } from '../../../shared/ui';
import { copy } from './copy';
import styles from './Incidents.module.css';

const STATE_OPTIONS: readonly SegmentOption[] = [
  { id: 'open', label: copy.filters.open },
  { id: 'resolved', label: copy.filters.resolved }
];
const KIND_OPTIONS: readonly SegmentOption[] = [
  { id: 'all', label: copy.filters.all },
  { id: 'publish_unknown', label: copy.filters.unknown },
  { id: 'publish_failed', label: copy.filters.failed }
];

type Props = {
  state: IncidentState;
  kind: IncidentKind | undefined;
  onStateChange: (state: IncidentState) => void;
  onKindChange: (kind: IncidentKind | undefined) => void;
};

const isState = (id: string): id is IncidentState => id === 'open' || id === 'resolved';
const isKind = (id: string): id is IncidentKind => id === 'publish_unknown' || id === 'publish_failed';

export function IncidentFilters({ state, kind, onStateChange, onKindChange }: Props) {
  return (
    <div className={styles.filters}>
      <SegmentedControl
        label={copy.filters.state}
        options={STATE_OPTIONS}
        value={state}
        onChange={(id) => {
          if (isState(id)) onStateChange(id);
        }}
        fullWidth
      />
      {/* On a phone the chips scroll inside their own container, never the page. */}
      <div className={styles.chips}>
        <SegmentedControl
          label={copy.filters.kind}
          options={KIND_OPTIONS}
          value={kind ?? 'all'}
          onChange={(id) => onKindChange(isKind(id) ? id : undefined)}
        />
      </div>
    </div>
  );
}
