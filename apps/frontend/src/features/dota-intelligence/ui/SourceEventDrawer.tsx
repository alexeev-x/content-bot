import type { SourceEventDto, SourceEventEntityDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ApiError } from '../../../shared/api/http-client';
import { Banner, Button, Drawer, ErrorState, Icon, LoadingImage, Skeleton, VisuallyHidden } from '../../../shared/ui';
import {
  sourceEventAiDraftQueryOptions,
  sourceEventContentQueryOptions,
  useApproveSourceEventAiDraft,
  useCreateSourceEventDraft,
  useRequestSourceEventAiDraft,
  useAttachSourceEventImages,
  useSetSourceEventHidden
} from '../api/sources-queries';
import { DotaTime } from './DotaTime';
import { EventSeries } from './EventSeries';
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

/** The AI's draft of this event, the same one the bot shows; approving here or there makes the same post. */
function AiDraft({ event, draftId }: { event: SourceEventDto; draftId: string }) {
  const navigate = useNavigate();
  const draft = useQuery(sourceEventAiDraftQueryOptions(event.id, draftId));
  const approve = useApproveSourceEventAiDraft();
  const openPost = (id: string) => void navigate({ to: '/posts/$id', params: { id } });
  if (draft.isPending)
    return (
      <section className={styles.aiDraft} aria-busy="true">
        <VisuallyHidden>Загружаю черновик ИИ</VisuallyHidden>
        <Skeleton lines={5} />
      </section>
    );
  if (!draft.data)
    return (
      <ErrorState
        message="Не удалось загрузить черновик ИИ. Повторите."
        {...(draft.error instanceof ApiError && draft.error.requestId ? { requestId: draft.error.requestId } : {})}
        onRetry={() => void draft.refetch()}
      />
    );
  const { status, text, question, postId, versionId } = draft.data;
  if (status === 'failed')
    return (
      <Banner tone="warning" title="ИИ не смог написать пост">
        Нажмите «Написать через ИИ» ещё раз.
      </Banner>
    );
  if (status === 'question')
    return (
      <Banner tone="info" title="ИИ задал вопрос в боте">
        {question ?? 'Ответьте ему в боте — после ответа он напишет пост.'}
      </Banner>
    );
  const notAPost = approve.error instanceof ApiError && approve.error.reason === 'NOT_A_POST';
  return (
    <section className={styles.aiDraft} aria-labelledby={`ai-draft-${event.id}`}>
      <h3 id={`ai-draft-${event.id}`} className={styles.aiDraftTitle}>
        Черновик ИИ
      </h3>
      {text ? <p className={styles.aiDraftText}>{text}</p> : null}
      {approve.error ? (
        <Banner tone="error" title="Не получилось">
          {notAPost
            ? 'Текст не влезает в пост. Сократите его в боте («Короче») и одобрите снова.'
            : 'Сервер не подтвердил одобрение, ничего не изменилось. Повторите.'}
        </Banner>
      ) : null}
      <div className={styles.actions}>
        {postId ? (
          <Button variant="primary" icon="edit" onPress={() => openPost(postId)}>
            Открыть пост
          </Button>
        ) : (
          <Button
            variant="primary"
            icon="check-circle"
            isLoading={approve.isPending}
            onPress={() =>
              approve.mutate({ id: event.id, versionId }, { onSuccess: (result) => openPost(result.postId) })
            }
          >
            Одобрить
          </Button>
        )}
      </div>
      <p className={styles.muted}>
        {postId
          ? 'Одобрено: пост в студии, картинки анонса прикрепляются к нему сами.'
          : 'Переписать или поправить можно в боте. Одобренный текст станет постом в студии с картинками анонса.'}
      </p>
    </section>
  );
}

type Props = {
  event: SourceEventDto | undefined;
  now: number;
  timezone: string;
  /** DEV only: «Проверить автопубликацию» on an announcement without a post. */
  autopublishTest?: boolean;
  onClose: () => void;
};

/** Everything about one event without making a draft first (owner, 21.10.2026): the announcement and its actions. */
export function SourceEventDrawer({ event, now, timezone, autopublishTest = false, onClose }: Props) {
  const navigate = useNavigate();
  const aiDraft = useRequestSourceEventAiDraft();
  const draft = useCreateSourceEventDraft();
  const visibility = useSetSourceEventHidden();
  const images = useAttachSourceEventImages();
  const error = aiDraft.error ?? draft.error ?? visibility.error ?? images.error;
  const reason = error instanceof ApiError ? error.reason : undefined;
  const busy = aiDraft.isPending || draft.isPending || visibility.isPending;

  const actions = event ? (
    <div className={styles.actions}>
      {/* An announcement can always go to the AI, even with an older (template) draft (owner, 21.10.2026). */}
      {event.type !== 'patch' ? (
        <Button
          variant={event.draft || event.aiDraftId !== null || event.aiSeriesId !== null ? 'secondary' : 'primary'}
          icon="sparkle"
          isLoading={aiDraft.isPending}
          isDisabled={busy || event.aiWriting || event.status === 'hidden'}
          onPress={() => aiDraft.mutate(event.id)}
        >
          {event.aiWriting ? 'ИИ пишет…' : 'Написать через ИИ'}
        </Button>
      ) : null}
      {/* DEV test (owner, 23.10.2026): the whole way without the owner, as if Cron had just found it. */}
      {autopublishTest && event.type !== 'patch' && event.draft === null ? (
        <Button
          variant="secondary"
          icon="send"
          isDisabled={busy || event.aiWriting || event.status === 'hidden'}
          onPress={() => aiDraft.mutate({ id: event.id, autopublishTest: true })}
        >
          Проверить автопубликацию (DEV)
        </Button>
      ) : null}
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
          {event.type !== 'patch' && event.status !== 'published' ? (
            <Button
              variant="ghost"
              icon="image"
              isLoading={images.isPending}
              isDisabled={busy || images.isSuccess}
              onPress={() => images.mutate(event.id)}
            >
              {images.isSuccess ? 'Картинки прикрепляются…' : 'Прикрепить картинки из анонса'}
            </Button>
          ) : null}
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
      ) : null}
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
          {event.aiWriting ? (
            <Banner tone="info" title="ИИ пишет пост">
              Обычно это минута-две. Черновик придёт в бот: там его можно одобрить, переписать или поправить.
            </Banner>
          ) : event.aiSeriesId !== null ? (
            <EventSeries event={event} seriesId={event.aiSeriesId} />
          ) : event.aiDraftId !== null ? (
            <AiDraft event={event} draftId={event.aiDraftId} />
          ) : null}
          {error ? (
            <Banner tone={reason === 'EVENT_HIDDEN' ? 'warning' : 'error'} title="Не получилось">
              {reason === 'EVENT_HIDDEN'
                ? 'Событие пропущено: верните его, чтобы сделать пост.'
                : reason === 'AI_WRITING'
                  ? 'ИИ уже пишет этот пост, дождитесь черновика в боте.'
                  : reason === 'AUTOPUBLISH_TEST_OFF'
                    ? 'Проверка автопубликации здесь выключена.'
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
