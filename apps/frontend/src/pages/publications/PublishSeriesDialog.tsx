import { PUBLICATION_SERIES_MAX, pollIssue, type PostDto } from '@alexeev/contracts';
import { now, type ZonedDateTime } from '@internationalized/date';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { postsInfiniteQueryOptions, useApprovePost } from '../../features/posts';
import {
  browserTimeZone,
  publishDestinationsQueryOptions,
  useSubmitPublicationSeries
} from '../../features/publications';
import { ApiError } from '../../shared/api/http-client';
import {
  Banner,
  Button,
  DateTimeField,
  Dialog,
  IconButton,
  Radio,
  RadioGroup,
  Select,
  Skeleton
} from '../../shared/ui';
import styles from './PublishSeriesDialog.module.css';

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  timezone?: string;
  /** Posts to start with, in order (an event's series). */
  initialPostIds?: readonly string[];
  onPublished: (firstPublicationId: string) => void;
};

const INTERVALS = [
  { id: '10', label: '10 минут' },
  { id: '30', label: '30 минут' },
  { id: '60', label: '1 час' },
  { id: '120', label: '2 часа' },
  { id: '180', label: '3 часа' }
];

const REFUSAL: Record<string, string> = {
  POST_NOT_APPROVED: 'не одобрен',
  STALE_REVISION: 'изменился — откройте его заново',
  POST_ARCHIVED: 'в архиве',
  ALREADY_PUBLISHED: 'уже запланирован или отправляется в этот канал',
  POST_NOT_FOUND: 'не найден'
};

/**
 * «Опубликовать серию» (owner, 22.10.2026): posts go out in this order, each only after the previous one went out
 * and no sooner than the interval after it; a post that did not go out holds the rest until the owner resolves it.
 * Drafts are approved here, as on the publish screen. Composed by the page: posts and publications are features.
 */
export function PublishSeriesDialog({ isOpen, onOpenChange, timezone, initialPostIds = [], onPublished }: Props) {
  const zone = timezone ?? browserTimeZone();
  const posts = useInfiniteQuery({ ...postsInfiniteQueryOptions({ view: 'live' }), enabled: isOpen });
  const destinations = useQuery({ ...publishDestinationsQueryOptions(), enabled: isOpen });
  const approve = useApprovePost();
  const submit = useSubmitPublicationSeries();
  const ready = useMemo<PostDto[]>(
    () => posts.data?.pages.flatMap((page) => page.items).filter(canBePublished) ?? [],
    [posts.data]
  );
  const [picked, setPicked] = useState<string[]>(() => [...initialPostIds]);
  const [destinationId, setDestinationId] = useState('');
  const [mode, setMode] = useState<'now' | 'later'>('now');
  const [scheduledAt, setScheduledAt] = useState<ZonedDateTime>(() =>
    now(zone).add({ hours: 1 }).set({ second: 0, millisecond: 0 })
  );
  // Owner, 22.10.2026: posts of one series go 10 minutes apart by default.
  const [interval, setInterval] = useState('10');
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const byId = new Map(ready.map((post) => [post.id, post]));
  const chosen = picked.map((id) => byId.get(id)).filter((post): post is PostDto => post !== undefined);
  const options = destinations.data?.items ?? [];
  const channel = destinationId || (options.length === 1 ? (options[0]?.id ?? '') : '');
  const later = mode === 'later';
  const validTime = !later || scheduledAt.toDate().getTime() > now(zone).toDate().getTime();
  const canSubmit = chosen.length >= 2 && channel !== '' && validTime && !busy;

  const move = (index: number, by: -1 | 1) =>
    setPicked((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      if (item !== undefined) next.splice(index + by, 0, item);
      return next;
    });

  async function publish() {
    if (!canSubmit) return;
    setBusy(true);
    setFailure(null);
    try {
      // Drafts are approved first, in order; an approved post never changes, so its revision is the one to send.
      const items: { postId: string; revision: number }[] = [];
      for (const post of chosen) {
        const current =
          post.status === 'approved'
            ? post
            : await approve.mutateAsync({ id: post.id, input: { revision: post.revision } });
        items.push({ postId: current.id, revision: current.revision });
      }
      const series = await submit.mutateAsync({
        input: {
          items,
          destinationId: channel,
          scheduledAt: (later ? scheduledAt.toDate() : new Date()).toISOString(),
          timezone: zone,
          intervalMinutes: Number(interval)
        },
        key: crypto.randomUUID()
      });
      const first = series.publications[0];
      onOpenChange(false);
      if (first) onPublished(first.id);
    } catch (error) {
      setFailure(describe(error, byId));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="wide"
      title="Опубликовать серию"
      description="Посты уходят по порядку: следующий — только после того, как вышел предыдущий, и не раньше интервала после него."
      footer={
        <>
          <Button variant="secondary" onPress={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            icon={later ? 'calendar' : 'send'}
            isDisabled={!canSubmit}
            isLoading={busy}
            onPress={() => void publish()}
          >
            {later ? 'Запланировать серию' : 'Опубликовать серию'}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        {failure ? (
          <Banner tone="error" title="Серия не запланирована" onDismiss={() => setFailure(null)}>
            {failure}
          </Banner>
        ) : null}
        {posts.isPending || destinations.isPending ? (
          <Skeleton lines={4} height={20} />
        ) : (
          <>
            <section aria-labelledby="series-posts">
              <h3 id="series-posts" className={styles.heading}>
                Посты по порядку
              </h3>
              {chosen.length === 0 ? (
                <p className={styles.note}>Добавьте от 2 до {PUBLICATION_SERIES_MAX} постов.</p>
              ) : null}
              <ol className={styles.list}>
                {chosen.map((post, index) => (
                  <li key={post.id} className={styles.item}>
                    <span className={styles.position}>{index + 1}</span>
                    <span className={styles.title}>
                      {post.title.trim() || '—'}
                      {post.status === 'draft' ? <span className={styles.note}> · черновик, одобрится</span> : null}
                    </span>
                    <IconButton
                      label="Выше"
                      icon="arrow-up"
                      size="sm"
                      isDisabled={index === 0}
                      onPress={() => move(index, -1)}
                    />
                    <IconButton
                      label="Ниже"
                      icon="arrow-down"
                      size="sm"
                      isDisabled={index === chosen.length - 1}
                      onPress={() => move(index, 1)}
                    />
                    <IconButton
                      label="Убрать из серии"
                      icon="x"
                      size="sm"
                      onPress={() => setPicked((current) => current.filter((id) => id !== post.id))}
                    />
                  </li>
                ))}
              </ol>
              {chosen.length < PUBLICATION_SERIES_MAX ? (
                <Select
                  label="Добавить пост"
                  placeholder="Выберите пост"
                  options={ready
                    .filter((post) => !picked.includes(post.id))
                    .map((post) => ({
                      id: post.id,
                      label: `${post.title.trim() || '—'}${post.status === 'draft' ? ' (черновик)' : ''}`
                    }))}
                  value={null}
                  onChange={(id) => setPicked((current) => [...current, id])}
                />
              ) : null}
            </section>
            {options.length === 0 ? (
              <Banner tone="warning" title="Нет подключённых каналов">
                Подключите канал, прежде чем продолжить.
              </Banner>
            ) : (
              <RadioGroup label="Канал" variant="rows" value={channel} onChange={setDestinationId}>
                {options.map((item) => (
                  <Radio key={item.id} value={item.id}>
                    {item.title}
                  </Radio>
                ))}
              </RadioGroup>
            )}
            <RadioGroup
              label="Первый пост"
              variant="rows"
              value={mode}
              onChange={(next) => setMode(next as 'now' | 'later')}
            >
              <Radio value="now">Сейчас</Radio>
              <Radio value="later">Запланировать</Radio>
            </RadioGroup>
            {later ? (
              <DateTimeField
                label="Дата и время первого поста"
                value={scheduledAt}
                onChange={(value) => {
                  if (value) setScheduledAt(value);
                }}
                timeZone={zone}
                minValue={now(zone)}
                isRequired
              />
            ) : null}
            <Select
              label="Интервал между постами"
              options={INTERVALS}
              value={interval}
              onChange={setInterval}
              description="Если предыдущий пост вышел позже, следующий ждёт этот интервал уже от него."
            />
          </>
        )}
      </div>
    </Dialog>
  );
}

function canBePublished(post: PostDto): boolean {
  if (post.status === 'approved') return true;
  if (post.kind === 'poll') return post.poll !== null && pollIssue(post.poll) === null;
  return post.body.trim() !== '' || post.media.length > 0;
}

function describe(error: unknown, byId: Map<string, PostDto>): string {
  if (!(error instanceof ApiError)) return 'Не удалось связаться с сервером. Ничего не отправлено, повторите попытку.';
  const postId = error.details?.['postId'];
  const reason = error.reason === undefined ? undefined : REFUSAL[error.reason];
  const title = postId === undefined ? undefined : byId.get(postId)?.title.trim();
  const requestId = error.requestId ? ` Код запроса: ${error.requestId}.` : '';
  if (reason !== undefined)
    return `${title ? `Пост «${title}»` : 'Один из постов'} ${reason}. Ничего не запланировано.${requestId}`;
  return `Сервер не принял серию: ничего не запланировано.${requestId}`;
}
