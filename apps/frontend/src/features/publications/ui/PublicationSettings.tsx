import type { PostDto } from '@alexeev/contracts';
import { now, type ZonedDateTime } from '@internationalized/date';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { browserTimeZone, formatWithZone } from '../model/format-time';
import { defaultScheduledAt } from '../model/publish-form';
import { publishDestinationsQueryOptions } from '../api/publications-queries';
import { Banner, Button, DateTimeField, ErrorState, Select, SegmentedControl, Skeleton } from '../../../shared/ui';
import { PublishDialog } from './PublishDialog';
import styles from './PublishDialog.module.css';

const WHEN = [
  { id: 'now', label: 'Опубликовать сейчас', icon: 'send' },
  { id: 'later', label: 'Запланировать', icon: 'calendar' }
] as const;

type Props = { post: PostDto };

/** In-page settings for the second editor screen. Sending remains behind PublishDialog's explicit final action. */
export function PublicationSettings({ post }: Props) {
  const timeZone = useMemo(() => browserTimeZone(), []);
  const destinations = useQuery(publishDestinationsQueryOptions());
  const [destinationId, setDestinationId] = useState('');
  const [mode, setMode] = useState<'now' | 'later'>('now');
  const [scheduledAt, setScheduledAt] = useState<ZonedDateTime>(() => defaultScheduledAt(timeZone));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const options = destinations.data?.items ?? [];

  const selectedDestinationId = destinationId || (options.length === 1 ? (options[0]?.id ?? '') : '');

  if (destinations.isPending)
    return (
      <div className={styles.form} aria-busy="true">
        <Skeleton height={48} />
        <Skeleton height={48} />
      </div>
    );
  if (destinations.isError) {
    return <ErrorState message="Не удалось загрузить список каналов." onRetry={() => void destinations.refetch()} />;
  }
  if (options.length === 0) {
    return (
      <Banner tone="warning" title="Нет подключённых каналов">
        Подключите канал, прежде чем продолжить.
      </Banner>
    );
  }

  const selected = options.find((item) => item.id === selectedDestinationId);
  const validSchedule = mode === 'now' || scheduledAt.toDate().getTime() > now(timeZone).toDate().getTime();

  return (
    <section className={styles.form} aria-labelledby="publication-settings-title">
      <h2 id="publication-settings-title">Канал и время публикации</h2>
      <Select
        label="Telegram-канал"
        options={options.map((item) => ({ id: item.id, label: item.title, description: item.chatId }))}
        value={selectedDestinationId || null}
        onChange={setDestinationId}
        isRequired
        placeholder="Выберите канал"
      />
      <SegmentedControl
        label="Когда опубликовать"
        options={WHEN}
        value={mode}
        onChange={(next) => setMode(next as 'now' | 'later')}
        fullWidth
      />
      {mode === 'later' ? (
        <DateTimeField
          label="Дата и время"
          value={scheduledAt}
          onChange={(value) => {
            if (value) setScheduledAt(value);
          }}
          timeZone={timeZone}
          minValue={now(timeZone)}
          isRequired
        />
      ) : null}
      <p className={styles.description}>
        {selected ? `Канал: ${selected.title}. ` : 'Выберите канал. '}
        {mode === 'now'
          ? 'Публикация будет поставлена в очередь после подтверждения.'
          : `Время: ${formatWithZone(scheduledAt.toDate().toISOString(), timeZone)}.`}
      </p>
      <Button
        icon={mode === 'now' ? 'send' : 'calendar'}
        isDisabled={!destinationId || !validSchedule}
        onPress={() => setConfirmOpen(true)}
      >
        Проверить и подтвердить
      </Button>
      <PublishDialog
        post={post}
        isOpen={confirmOpen}
        onOpenChange={setConfirmOpen}
        initialSettings={{ destinationId: selectedDestinationId, mode, scheduledAt }}
        lockSettings
      />
    </section>
  );
}
