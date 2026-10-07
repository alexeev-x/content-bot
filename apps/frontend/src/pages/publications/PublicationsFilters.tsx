import { useState } from 'react';
import { publicationStatusSchema, type DestinationDto, type PublicationStatus } from '@alexeev/contracts';
import { publicationCopy } from '../../features/publications';
import { ru } from '../../shared/lib/ru';
import { Button, Drawer, Select, useMediaQuery, VisuallyHidden } from '../../shared/ui';
import styles from './PublicationsPage.module.css';
import type { PublicationView } from './search';

const ALL = 'all';
const FILTERABLE: readonly PublicationStatus[] = publicationStatusSchema.options.filter(
  (status) => status !== 'preparing'
);

type Props = {
  view: PublicationView | undefined;
  status: PublicationStatus | undefined;
  channel: string | undefined;
  order: 'asc' | 'desc' | undefined;
  destinations: readonly DestinationDto[];
  onViewChange: (view: PublicationView | undefined) => void;
  onStatusChange: (status: PublicationStatus | undefined) => void;
  onChannelChange: (channel: string | undefined) => void;
  onOrderChange: (order: 'asc' | 'desc') => void;
  onReset: () => void;
};

const presets: readonly { id: PublicationView | 'all'; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'today', label: 'Сегодня' },
  { id: 'upcoming', label: 'Запланированные' },
  { id: 'recent', label: 'Отправленные' },
  { id: 'errors', label: 'Ошибки' }
];

export function PublicationsFilters({
  view,
  status,
  channel,
  order,
  destinations,
  onViewChange,
  onStatusChange,
  onChannelChange,
  onOrderChange,
  onReset
}: Props) {
  const copy = publicationCopy.filters;
  const narrow = useMediaQuery('(max-width: 859px)');
  const [open, setOpen] = useState(false);
  const activeCount =
    (view !== undefined ? 1 : 0) +
    (status !== undefined ? 1 : 0) +
    (channel !== undefined ? 1 : 0) +
    (order !== undefined ? 1 : 0);
  const hasFilters = activeCount > 0;

  const fields = (
    <>
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
      <Select
        label="Сортировка"
        value={order ?? (view === 'upcoming' ? 'asc' : 'desc')}
        options={[
          { id: 'desc', label: 'Сначала новые' },
          { id: 'asc', label: 'Сначала ближайшие' }
        ]}
        onChange={(id) => onOrderChange(id as 'asc' | 'desc')}
      />
    </>
  );

  return (
    <section className={styles.filterPanel} aria-label="Фильтры публикаций">
      <fieldset className={styles.presets}>
        <VisuallyHidden>
          <legend>Быстрые фильтры</legend>
        </VisuallyHidden>
        {presets.map((preset) => {
          const selected = preset.id === 'all' ? view === undefined : view === preset.id;
          return (
            <Button
              key={preset.id}
              size="sm"
              variant={selected ? 'primary' : 'secondary'}
              onPress={() => onViewChange(preset.id === 'all' ? undefined : preset.id)}
            >
              {preset.label}
            </Button>
          );
        })}
      </fieldset>

      {narrow ? (
        <>
          <div className={styles.filterBar}>
            <Button variant="secondary" icon="settings" onPress={() => setOpen(true)}>
              {copy.open(activeCount)}
            </Button>
            {hasFilters ? (
              <Button variant="ghost" icon="x" onPress={onReset}>
                {copy.reset}
              </Button>
            ) : null}
          </div>
          <Drawer
            variant="bottom"
            title={copy.sheetTitle}
            isOpen={open}
            onOpenChange={setOpen}
            footer={<Button onPress={() => setOpen(false)}>{copy.done}</Button>}
          >
            <div className={styles.sheetFields}>{fields}</div>
          </Drawer>
        </>
      ) : (
        <div className={styles.filters}>
          {fields}
          {hasFilters ? (
            <Button variant="ghost" icon="x" onPress={onReset}>
              {copy.reset}
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}
