import type { PostDto } from '@alexeev/contracts';
import { now, type ZonedDateTime } from '@internationalized/date';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { browserTimeZone, formatWithZone } from '../model/format-time';
import { defaultScheduledAt } from '../model/publish-form';
import { publishDestinationsQueryOptions } from '../api/publications-queries';
import {
  Banner,
  Button,
  DateTimeField,
  Dialog,
  ErrorState,
  Icon,
  Radio,
  RadioGroup,
  Skeleton,
  useMediaQuery
} from '../../../shared/ui';
import { PublishDialog } from './PublishDialog';
import styles from './PublishDialog.module.css';

const WHEN = [
  { id: 'now', label: 'Опубликовать сейчас', icon: 'send' },
  { id: 'later', label: 'Запланировать', icon: 'calendar' }
] as const;

type Props = { post: PostDto; onBack: () => void; children: ReactNode };

/** In-page settings for the second editor screen. Sending remains behind PublishDialog's explicit final action. */
export function PublicationSettings({ post, onBack, children }: Props) {
  const timeZone = useMemo(() => browserTimeZone(), []);
  const narrow = useMediaQuery('(max-width: 859px)');
  const destinations = useQuery(publishDestinationsQueryOptions());
  const [destinationId, setDestinationId] = useState('');
  const [mode, setMode] = useState<'now' | 'later'>('now');
  const [destinationPickerOpen, setDestinationPickerOpen] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<ZonedDateTime>(() => defaultScheduledAt(timeZone));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const options = destinations.data?.items ?? [];

  const selectedDestinationId = destinationId || (options.length === 1 ? (options[0]?.id ?? '') : '');

  if (destinations.isPending)
    return (
      <div className={styles.publishGrid} aria-busy="true">
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
    <div className={styles.publishGrid}>
      <section className={styles.form} aria-labelledby="publication-settings-title">
        <h2 id="publication-settings-title">Канал</h2>
        <Button
          variant="secondary"
          size="xl"
          fullWidth
          aria-haspopup="dialog"
          aria-label={selected ? `Канал: ${selected.title}` : 'Выберите канал'}
          className={styles.destinationCard}
          onPress={() => setDestinationPickerOpen(true)}
        >
          <span className={styles.destinationAvatar} aria-hidden="true">
            {selected?.title.slice(0, 1).toLocaleUpperCase('ru-RU') ?? <Icon name="send" size={18} />}
          </span>
          <span className={styles.destinationCopy}>
            <strong>{selected?.title ?? 'Выберите канал'}</strong>
            <span>{selected ? 'Telegram-канал' : 'Канал для публикации'}</span>
          </span>
          <Icon name="chevron-right" size={18} />
        </Button>
        <RadioGroup
          label="Время публикации"
          variant="rows"
          value={mode}
          onChange={(next) => setMode(next as 'now' | 'later')}
        >
          <Radio value="now">{narrow ? 'Сейчас' : WHEN[0].label}</Radio>
          <Radio value="later">{WHEN[1].label}</Radio>
        </RadioGroup>
        <DateTimeField
          label="Дата и время"
          value={mode === 'now' ? now(timeZone) : scheduledAt}
          onChange={(value) => {
            if (value) setScheduledAt(value);
          }}
          timeZone={timeZone}
          minValue={now(timeZone)}
          isRequired={mode === 'later'}
          isDisabled={mode === 'now'}
        />
        <p className={styles.description}>
          {selected ? `Канал: ${selected.title}. ` : 'Выберите канал. '}
          {mode === 'now'
            ? 'Публикация будет поставлена в очередь после подтверждения.'
            : `Время: ${formatWithZone(scheduledAt.toDate().toISOString(), timeZone)}.`}
        </p>
      </section>
      <section className={styles.previewColumn} aria-label="Предпросмотр публикации">
        <h2>Предпросмотр публикации</h2>
        {children}
      </section>
      <footer className={styles.publishActions}>
        <Button variant="secondary" icon="arrow-left" onPress={onBack}>
          Назад
        </Button>
        <div className={styles.publishPrimary}>
          <Button
            icon={mode === 'now' ? 'send' : 'calendar'}
            isDisabled={!selectedDestinationId || !validSchedule}
            onPress={() => setConfirmOpen(true)}
          >
            {mode === 'now' ? 'Опубликовать' : 'Запланировать'}
          </Button>
          <p className={styles.publishCaption}>Пост будет опубликован в выбранном канале.</p>
        </div>
      </footer>
      <PublishDialog
        post={post}
        isOpen={confirmOpen}
        onOpenChange={setConfirmOpen}
        initialSettings={{ destinationId: selectedDestinationId, mode, scheduledAt }}
        lockSettings
      />
      <Dialog
        isOpen={destinationPickerOpen}
        onOpenChange={setDestinationPickerOpen}
        title="Выберите канал"
        description="Пост будет опубликован в выбранный канал."
      >
        <RadioGroup
          label="Telegram-канал"
          variant="rows"
          value={selectedDestinationId}
          onChange={(id) => {
            setDestinationId(id);
            setDestinationPickerOpen(false);
          }}
        >
          {options.map((item) => (
            <Radio key={item.id} value={item.id} description={item.chatId}>
              {item.title}
            </Radio>
          ))}
        </RadioGroup>
      </Dialog>
    </div>
  );
}
