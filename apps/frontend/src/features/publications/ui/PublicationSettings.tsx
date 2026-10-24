import type { PostDto, PublicationDto } from '@alexeev/contracts';
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

/** Quick answers to «когда»: every instant is computed in the owner's zone, not the browser's. */
function schedulePresets(zone: string): { label: string; at: ZonedDateTime }[] {
  const current = now(zone);
  const at = (days: number, hour: number) => current.add({ days }).set({ hour, minute: 0, second: 0, millisecond: 0 });
  return [
    { label: 'Через час', at: current.add({ hours: 1 }).set({ second: 0, millisecond: 0 }) },
    { label: 'Сегодня 18:00', at: at(0, 18) },
    { label: 'Завтра 10:00', at: at(1, 10) },
    { label: 'Завтра 18:00', at: at(1, 18) }
  ];
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
  /** More settings of this publication under «Куда и когда» (the post's send options), composed by the page. */
  settings?: ReactNode;
  timezone?: string;
  /** Approves a draft just before sending. Composed by the page because features never import each other. */
  ensureApproved?: EnsureApproved;
  /** The server accepted the request; the page leaves this screen, so the button stays locked until then. */
  onPublished?: (publication: PublicationDto) => void;
  /** Publishing is locked for now (the post's pictures are still being attached); the page says why. */
  isBlocked?: boolean;
};

/** In-page settings for the second editor screen: «Опубликовать» here is the final action and sends at once. */
export function PublicationSettings({
  post,
  onBack,
  children,
  settings,
  timezone,
  ensureApproved,
  onPublished,
  isBlocked = false
}: Props) {
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
  const [done, setDone] = useState(false);
  const publishing = usePublish(approvedPost ?? post, timeZone, {
    onPublished: (publication) => {
      if (!onPublished) return;
      setDone(true);
      onPublished(publication);
    }
  });
  const options = destinations.data?.items ?? [];

  const selectedDestinationId =
    destinationId ||
    (options.length === 1
      ? (options[0]?.id ?? '')
      : options.some((item) => item.id === lastDestinationId)
        ? lastDestinationId
        : '');

  async function publish() {
    if (approving || done || !selectedDestinationId) return;
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
            <Radio key={item.id} value={item.id} {...(item.chatId.startsWith('@') ? { description: item.chatId } : {})}>
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
          <>
            <fieldset className={styles.presets}>
              <legend className={styles.presetsLegend}>Быстрый выбор времени</legend>
              {schedulePresets(timeZone).map((preset) => (
                <Button
                  key={preset.label}
                  variant="soft"
                  size="sm"
                  isDisabled={preset.at.toDate().getTime() <= now(timeZone).toDate().getTime()}
                  onPress={() => setScheduledAt(preset.at)}
                >
                  {preset.label}
                </Button>
              ))}
            </fieldset>
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
          </>
        ) : null}
        {settings}
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
            isDisabled={!selectedDestinationId || !validSchedule || done || isBlocked}
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
