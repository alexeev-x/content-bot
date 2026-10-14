import type { PostDto } from '@alexeev/contracts';
import { now, type ZonedDateTime } from '@internationalized/date';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { browserTimeZone } from '../model/format-time';
import { defaultScheduledAt } from '../model/publish-form';
import { publishDestinationsQueryOptions } from '../api/publications-queries';
import {
  Banner,
  Button,
  DateTimeField,
  ErrorState,
  Radio,
  RadioGroup,
  Skeleton,
  useMediaQuery
} from '../../../shared/ui';
import { usePublish } from '../model/use-publish';
import { PublishDuplicateDialog } from './PublishDuplicateDialog';
import styles from './PublishDialog.module.css';

const LAST_DESTINATION_KEY = 'publish:lastDestination';

function readLastDestination(): string {
  try {
    return window.localStorage.getItem(LAST_DESTINATION_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberDestination(id: string): void {
  try {
    window.localStorage.setItem(LAST_DESTINATION_KEY, id);
  } catch {
    // Remembering the channel is a convenience; private mode or a full quota must not block publishing.
  }
}

const WHEN = [
  { id: 'now', label: 'Опубликовать сейчас', icon: 'send' },
  { id: 'later', label: 'Запланировать', icon: 'calendar' }
] as const;

export type EnsureApproved = (
  post: PostDto
) => Promise<{ ok: true; post: PostDto } | { ok: false; title: string; message: string }>;

type Props = {
  post: PostDto;
  onBack: () => void;
  children: ReactNode;
  timezone?: string;
  /** Approves a draft just before sending. Composed by the page because features never import each other. */
  ensureApproved?: EnsureApproved;
};

/** In-page settings for the second editor screen: «Опубликовать» here is the final action and sends at once. */
export function PublicationSettings({ post, onBack, children, timezone, ensureApproved }: Props) {
  const timeZone = timezone ?? browserTimeZone();
  const narrow = useMediaQuery('(max-width: 859px)');
  const destinations = useQuery(publishDestinationsQueryOptions());
  const [destinationId, setDestinationId] = useState('');
  const [mode, setMode] = useState<'now' | 'later'>('now');
  const [lastDestinationId] = useState(readLastDestination);
  const [approving, setApproving] = useState(false);
  const [approvedPost, setApprovedPost] = useState<PostDto | null>(null);
  const [approveFailure, setApproveFailure] = useState<{ title: string; message: string } | null>(null);
  const [scheduledAt, setScheduledAt] = useState<ZonedDateTime>(() => defaultScheduledAt(timeZone));
  const publishing = usePublish(approvedPost ?? post, timeZone);
  const options = destinations.data?.items ?? [];

  const selectedDestinationId =
    destinationId ||
    (options.length === 1
      ? (options[0]?.id ?? '')
      : options.some((item) => item.id === lastDestinationId)
        ? lastDestinationId
        : '');

  async function publish() {
    if (approving || !selectedDestinationId) return;
    let target = approvedPost ?? post;
    if (target.status !== 'approved') {
      if (!ensureApproved) return;
      setApproving(true);
      setApproveFailure(null);
      try {
        const result = await ensureApproved(target);
        if (!result.ok) {
          setApproveFailure({ title: result.title, message: result.message });
          return;
        }
        target = result.post;
        setApprovedPost(result.post);
      } finally {
        setApproving(false);
      }
    }
    rememberDestination(selectedDestinationId);
    // A request that may have reached the server is resent as it was; otherwise this is a new one.
    const pending = publishing.findPending(selectedDestinationId, target);
    if (pending) await publishing.resendPending(pending, target);
    else await publishing.start({ destinationId: selectedDestinationId, mode, scheduledAt }, false, target);
  }

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

  const validSchedule = mode === 'now' || scheduledAt.toDate().getTime() > now(timeZone).toDate().getTime();

  return (
    <div className={styles.publishGrid}>
      <section className={styles.form} aria-labelledby="publication-settings-title">
        <h2 id="publication-settings-title">Куда и когда</h2>
        {approveFailure ? (
          <Banner tone="error" title={approveFailure.title} onDismiss={() => setApproveFailure(null)}>
            {approveFailure.message}
          </Banner>
        ) : null}
        <RadioGroup label="Канал" variant="rows" value={selectedDestinationId} onChange={(id) => setDestinationId(id)}>
          {options.map((item) => (
            <Radio key={item.id} value={item.id} description={item.chatId}>
              <span className={styles.destinationOption}>
                <span className={styles.destinationAvatar} aria-hidden="true">
                  {item.title.slice(0, 1).toLocaleUpperCase('ru-RU')}
                </span>
                <span className={styles.destinationTitle}>{item.title}</span>
              </span>
            </Radio>
          ))}
        </RadioGroup>
        <RadioGroup
          label="Время публикации"
          variant="rows"
          value={mode}
          onChange={(next) => setMode(next as 'now' | 'later')}
        >
          <Radio value="now">{narrow ? 'Сейчас' : WHEN[0].label}</Radio>
          <Radio value="later">{WHEN[1].label}</Radio>
        </RadioGroup>
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
            isLoading={publishing.isPending || approving}
            onPress={() => void publish()}
          >
            {mode === 'now' ? 'Опубликовать' : 'Запланировать'}
          </Button>
        </div>
      </footer>
      <PublishDuplicateDialog publish={publishing} />
    </div>
  );
}
