import type { SourceEventDto, SourceEventEntityDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ApiError } from '../../../shared/api/http-client';
import { Banner, Button, Drawer, ErrorState, Icon, LoadingImage, Skeleton, VisuallyHidden } from '../../../shared/ui';
import {
  sourceEventContentQueryOptions,
  useCreateSourceEventDraft,
  useRequestSourceEventAiDraft,
  useSetSourceEventHidden
} from '../api/sources-queries';
import { DotaTime } from './DotaTime';
import { EventStatus, TYPE_LABEL } from './event-status';
import styles from './SourceEventDrawer.module.css';

const entityKey = (entity: SourceEventEntityDto) => `${entity.kind}:${entity.name.toLocaleLowerCase('en-US')}`;

function PatchFacts({ event }: { event: SourceEventDto }) {
  if (event.facts.length === 0) return <p className={styles.muted}>Список изменений пока не разобран.</p>;
  const watched = new Set(event.watchHits.map(entityKey));
  const ordered = [
    ...event.facts.filter((fact) => watched.has(entityKey(fact))),
    ...event.facts.filter((fact) => !watched.has(entityKey(fact)))
  ];
  return (
    <ul className={styles.chips} aria-label="Затронутые герои и предметы">
      {ordered.map((fact) => (
        <li key={entityKey(fact)} className={styles.chip} data-watched={watched.has(entityKey(fact)) || undefined}>
          {watched.has(entityKey(fact)) ? <Icon name="bell" size={13} /> : null}
          {fact.name}
          {watched.has(entityKey(fact)) ? <VisuallyHidden>, вы следите</VisuallyHidden> : null}
        </li>
      ))}
    </ul>
  );
}

function Announcement({ event }: { event: SourceEventDto }) {
  const content = useQuery(sourceEventContentQueryOptions(event.id));
  if (content.isPending)
    return (
      <div className={styles.loading} aria-busy="true">
        <VisuallyHidden>Загружаю анонс</VisuallyHidden>
        <Skeleton height={220} />
        <Skeleton lines={6} />
      </div>
    );
  if (!content.data)
    return (
      <ErrorState
        message="Steam не отдал текст анонса. Повторите позже."
        {...(content.error instanceof ApiError && content.error.requestId
          ? { requestId: content.error.requestId }
          : {})}
        onRetry={() => void content.refetch()}
      />
    );
  const { text, images, officialUrl } = content.data;
  return (
    <>
      {officialUrl ? (
        <a className={styles.link} href={officialUrl} target="_blank" rel="noreferrer">
          Открыть на dota2.com
          <Icon name="external" size={13} />
        </a>
      ) : null}
      {images.map((src, index) => (
        <LoadingImage
          key={src}
          src={src}
          alt={`Картинка ${index + 1} из анонса «${event.title}»`}
          className={styles.image}
          loading="lazy"
        />
      ))}
      {text ? (
        <p className={styles.text} lang="en">
          {text}
        </p>
      ) : (
        <p className={styles.muted}>Steam больше не отдаёт текст этого анонса.</p>
      )}
    </>
  );
}

type Props = {
  event: SourceEventDto | undefined;
  now: number;
  timezone: string;
  onClose: () => void;
};

/** Everything about one event without making a draft first (owner, 21.10.2026): the announcement and its actions. */
export function SourceEventDrawer({ event, now, timezone, onClose }: Props) {
  const navigate = useNavigate();
  const aiDraft = useRequestSourceEventAiDraft();
  const draft = useCreateSourceEventDraft();
  const visibility = useSetSourceEventHidden();
  const error = aiDraft.error ?? draft.error ?? visibility.error;
  const reason = error instanceof ApiError ? error.reason : undefined;
  const busy = aiDraft.isPending || draft.isPending || visibility.isPending;

  const actions = event ? (
    <div className={styles.actions}>
      {event.draft ? (
        <>
          {event.status === 'drafted' ? (
            <Button
              variant="primary"
              icon="send"
              onPress={() => void navigate({ to: '/posts/$id/publish', params: { id: event.draft?.postId ?? '' } })}
            >
              Опубликовать
            </Button>
          ) : null}
          <Button
            variant="secondary"
            icon="edit"
            onPress={() => void navigate({ to: '/posts/$id', params: { id: event.draft?.postId ?? '' } })}
          >
            {event.status === 'published' ? 'Открыть пост' : 'Открыть черновик'}
          </Button>
        </>
      ) : event.type === 'patch' ? (
        <Button
          variant="primary"
          icon="plus"
          isLoading={draft.isPending}
          isDisabled={busy || event.status === 'hidden'}
          onPress={() =>
            draft.mutate(event.id, {
              onSuccess: (result) => {
                if (result.event.draft) void navigate({ to: '/posts/$id', params: { id: result.event.draft.postId } });
              }
            })
          }
        >
          Сделать пост
        </Button>
      ) : (
        <Button
          variant="primary"
          icon="sparkle"
          isLoading={aiDraft.isPending}
          isDisabled={busy || event.status === 'hidden'}
          onPress={() => aiDraft.mutate(event.id)}
        >
          {event.aiRequested ? 'Написать ещё раз' : 'Написать через ИИ'}
        </Button>
      )}
      {event.isPast ? null : event.status === 'hidden' ? (
        <Button
          variant="ghost"
          isLoading={visibility.isPending}
          isDisabled={busy}
          onPress={() => visibility.mutate({ id: event.id, hidden: false })}
        >
          Вернуть
        </Button>
      ) : event.status === 'new' ? (
        <Button
          variant="ghost"
          isLoading={visibility.isPending}
          isDisabled={busy}
          onPress={() => visibility.mutate({ id: event.id, hidden: true })}
        >
          Пропустить
        </Button>
      ) : null}
    </div>
  ) : null;

  return (
    <Drawer
      isOpen={event !== undefined}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      title={event?.title ?? 'Событие'}
      meta={event ? <EventStatus event={event} /> : undefined}
      footer={actions}
      size="wide"
    >
      {event ? (
        <div className={styles.body}>
          <p className={styles.muted}>
            {TYPE_LABEL[event.type]} · {event.sourceName} ·{' '}
            <DotaTime iso={event.publishedAt} now={now} timezone={timezone} />
          </p>
          <p className={styles.links}>
            <a className={styles.link} href={event.sourceUrl} target="_blank" rel="noreferrer">
              {event.type === 'patch' ? 'Официальные заметки' : 'Открыть в Steam'}
              <Icon name="external" size={13} />
            </a>
            {event.type === 'patch' ? (
              <Link className={styles.link} to="/sources" search={(previous) => ({ ...previous, update: event.id })}>
                Разбор патча
              </Link>
            ) : null}
          </p>
          {event.aiRequested || aiDraft.isSuccess ? (
            <Banner tone="info" title="ИИ пишет пост">
              Черновик придёт в бот: там его можно одобрить, переписать или поправить. После одобрения он появится
              здесь.
            </Banner>
          ) : null}
          {error ? (
            <Banner tone={reason === 'EVENT_HIDDEN' ? 'warning' : 'error'} title="Не получилось">
              {reason === 'EVENT_HIDDEN'
                ? 'Событие пропущено: верните его, чтобы сделать пост.'
                : error instanceof ApiError && error.code === 'RATE_LIMIT'
                  ? 'Слишком много запросов к ИИ подряд. Подождите несколько минут.'
                  : 'Сервер не подтвердил действие, ничего не изменилось. Повторите.'}
              {error instanceof ApiError && error.requestId ? ` Номер запроса: ${error.requestId}` : ''}
            </Banner>
          ) : null}
          {event.type === 'patch' ? <PatchFacts event={event} /> : <Announcement event={event} />}
        </div>
      ) : null}
    </Drawer>
  );
}
