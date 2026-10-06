import { publicationStatusSchema, type DestinationDto, type PublicationStatus } from '@alexeev/contracts';
import { publicationCopy } from '../../features/publications';
import { ru } from '../../shared/lib/ru';
import { Button, Select } from '../../shared/ui';
import styles from './PublicationsPage.module.css';

const ALL = 'all';
// «Публикуется» is two internal statuses; the list API filters by one, so only the one the owner can wait on is offered.
const FILTERABLE: readonly PublicationStatus[] = publicationStatusSchema.options.filter(
  (status) => status !== 'preparing'
);

type Props = {
  status: PublicationStatus | undefined;
  channel: string | undefined;
  destinations: readonly DestinationDto[];
  onStatusChange: (status: PublicationStatus | undefined) => void;
  onChannelChange: (channel: string | undefined) => void;
  onReset: () => void;
};

export function PublicationsFilters({
  status,
  channel,
  destinations,
  onStatusChange,
  onChannelChange,
  onReset
}: Props) {
  const copy = publicationCopy.filters;
  const hasFilters = status !== undefined || channel !== undefined;
  return (
    <div className={styles.filters}>
      <Select
        label={copy.status}
        value={status ?? ALL}
        options={[
          { id: ALL, label: copy.allStatuses },
          ...FILTERABLE.map((item) => ({ id: item, label: ru.status[item] }))
        ]}
        onChange={(id) => onStatusChange(id === ALL ? undefined : (id as PublicationStatus))}
      />
      <Select
        label={copy.channel}
        value={channel ?? ALL}
        options={[
          { id: ALL, label: copy.allChannels },
          ...destinations.map((item) => ({ id: item.id, label: item.title }))
        ]}
        onChange={(id) => onChannelChange(id === ALL ? undefined : id)}
      />
      {hasFilters ? (
        <Button variant="ghost" icon="x" onPress={onReset}>
          {copy.reset}
        </Button>
      ) : null}
    </div>
  );
}
