import type { SourceEventDto, SourceEventSeriesDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import {
  Banner,
  Button,
  Dialog,
  ErrorState,
  Icon,
  LoadingImage,
  Menu,
  Skeleton,
  TextArea,
  VisuallyHidden
} from '../../../shared/ui';
import {
  sourceEventSeriesQueryOptions,
  useApproveAllSeriesPosts,
  useApproveSourceEventSeriesPost,
  useRewriteSourceEventSeriesPost
} from '../api/sources-queries';
import styles from './SourceEventDrawer.module.css';

type Post = SourceEventSeriesDto['posts'][number];
const isVideo = (url: string) => /\.mp4$/i.test(url);
const INSTRUCTION_MAX = 300;

const REWRITE_ITEMS = [
  { id: 'short', label: 'Короче' },
  { id: 'more', label: 'Подробнее' },
  { id: 'again', label: 'Другой вариант' },
  { id: 'custom', label: 'Своё указание…' }
] as const;

/** A post of the series the owner can still approve: written, a draft, not approved yet. */
const approvable = (post: Post) =>
  post.status === 'ready' && post.draft !== null && post.draft.status === 'ready' && post.draft.postId === null;

function Media({ urls }: { urls: readonly string[] }) {
  if (urls.length === 0) return null;
  return (
    <ul className={styles.seriesMedia} aria-label="Картинки и видео поста">
      {urls.map((url, index) =>
        isVideo(url) ? (
          <li key={url} className={styles.seriesVideo}>
            <Icon name="play" size={16} />
            Видео
          </li>
        ) : (
          <li key={url}>
            <LoadingImage src={url} alt={`Картинка ${index + 1} поста`} className={styles.seriesThumb} loading="lazy" />
          </li>
        )
      )}
    </ul>
  );
}

function SeriesPost({ event, post, busy }: { event: SourceEventDto; post: Post; busy: boolean }) {
  const navigate = useNavigate();
  const approve = useApproveSourceEventSeriesPost();
  const rewrite = useRewriteSourceEventSeriesPost();
  const [asking, setAsking] = useState(false);
  const [instruction, setInstruction] = useState('');
  const draft = post.draft;
  const postId = draft?.postId ?? null;
  const error = approve.error ?? rewrite.error;
  const reason = error instanceof ApiError ? error.reason : undefined;
  const locked = busy || approve.isPending || rewrite.isPending;

  const sendRewrite = (action: 'short' | 'more' | 'again' | 'custom', text?: string) => {
    if (draft === null) return;
    approve.reset();
    rewrite.mutate({
      id: event.id,
      postId: post.id,
      input: { versionId: draft.versionId, action, ...(text === undefined ? {} : { instruction: text }) }
    });
  };

  return (
    <li className={styles.seriesPost}>
      <h4 className={styles.seriesTopic}>
        {post.position}. {post.topic}
      </h4>
      {post.status === 'writing' ? (
        <p className={styles.muted} aria-live="polite">
          ИИ пишет этот пост…
        </p>
      ) : post.status === 'failed' || draft === null || draft.status === 'failed' ? (
        <p className={styles.muted}>Этот пост не написался.</p>
      ) : draft.status === 'question' ? (
        <p className={styles.muted}>ИИ задал вопрос: {draft.question}</p>
      ) : (
        <>
          {rewrite.isPending ? (
            <p className={styles.muted} aria-live="polite">
              ИИ переписывает этот пост…
            </p>
          ) : draft.text ? (
            <p className={styles.aiDraftText}>{draft.text}</p>
          ) : null}
          <Media urls={post.media} />
          {error ? (
            <Banner tone="error" title="Не получилось">
              {reason === 'NOT_A_POST'
                ? 'Текст не влезает в пост. Нажмите «Переписать» → «Короче».'
                : reason === 'STALE_REVISION'
                  ? 'Пост уже изменился. Обновите панель и посмотрите новую версию.'
                  : error instanceof ApiError && error.code === 'RATE_LIMIT'
                    ? 'Слишком много запросов к ИИ подряд. Подождите несколько минут.'
                    : 'Сервер не подтвердил действие, ничего не изменилось. Повторите.'}
            </Banner>
          ) : null}
          <div className={styles.actions}>
            {postId ? (
              <Button
                variant="secondary"
                icon="edit"
                onPress={() => void navigate({ to: '/posts/$id', params: { id: postId } })}
              >
                Открыть пост
              </Button>
            ) : (
              <>
                <Button
                  variant="primary"
                  icon="check-circle"
                  isLoading={approve.isPending}
                  isDisabled={locked}
                  onPress={() => {
                    rewrite.reset();
                    approve.mutate({ id: event.id, postId: post.id, versionId: draft.versionId });
                  }}
                >
                  Одобрить
                </Button>
                <Menu
                  label="Переписать пост"
                  triggerText="Переписать"
                  triggerIcon="sparkle"
                  items={REWRITE_ITEMS.map((item) => ({ ...item, isDisabled: locked }))}
                  onAction={(id) => {
                    if (id === 'custom') setAsking(true);
                    else sendRewrite(id as 'short' | 'more' | 'again');
                  }}
                />
              </>
            )}
          </div>
        </>
      )}
      <Dialog
        isOpen={asking}
        onOpenChange={setAsking}
        title="Что поправить в посте"
        description="ИИ перепишет только этот пост, факты останутся из страницы события."
        footer={
          <>
            <Button variant="ghost" onPress={() => setAsking(false)}>
              Отмена
            </Button>
            <Button
              variant="primary"
              isDisabled={instruction.trim() === ''}
              onPress={() => {
                sendRewrite('custom', instruction.trim());
                setAsking(false);
                setInstruction('');
              }}
            >
              Переписать
            </Button>
          </>
        }
      >
        <TextArea
          label="Указание"
          placeholder="Например: убери шутку про Габена, назови героев как игроки"
          value={instruction}
          onChange={setInstruction}
          maxLength={INSTRUCTION_MAX}
          minRows={3}
        />
      </Dialog>
    </li>
  );
}

/** The event's planned series (owner, 21.10.2026: several logical posts, not one): approved one by one or all at once. */
export function EventSeries({ event, seriesId }: { event: SourceEventDto; seriesId: string }) {
  const series = useQuery(sourceEventSeriesQueryOptions(event.id, seriesId));
  const approveAll = useApproveAllSeriesPosts();
  if (series.isPending)
    return (
      <section className={styles.aiDraft} aria-busy="true">
        <VisuallyHidden>Загружаю серию постов</VisuallyHidden>
        <Skeleton lines={6} />
      </section>
    );
  if (!series.data)
    return (
      <ErrorState
        message="Не удалось загрузить серию постов. Повторите."
        {...(series.error instanceof ApiError && series.error.requestId ? { requestId: series.error.requestId } : {})}
        onRetry={() => void series.refetch()}
      />
    );
  const { posts } = series.data;
  const writing = posts.filter((post) => post.status === 'writing').length;
  const ready = posts.filter(approvable);
  return (
    <section className={styles.aiDraft} aria-labelledby={`series-${event.id}`}>
      <h3 id={`series-${event.id}`} className={styles.aiDraftTitle}>
        Серия постов: {posts.length}
      </h3>
      <p className={styles.muted}>
        {writing > 0
          ? `ИИ пишет посты по странице события: готово ${posts.length - writing} из ${posts.length}.`
          : 'Каждый пост можно переписать или одобрить. Одобренный становится постом в студии со своими картинками.'}
      </p>
      {ready.length > 1 ? (
        <div className={styles.actions}>
          <Button
            variant="primary"
            icon="check-circle"
            isLoading={approveAll.isPending}
            onPress={() =>
              approveAll.mutate({
                id: event.id,
                posts: ready.map((post) => ({ postId: post.id, versionId: post.draft?.versionId ?? '' }))
              })
            }
          >
            Одобрить все ({ready.length})
          </Button>
        </div>
      ) : null}
      {approveAll.isSuccess ? (
        <Banner tone="info" title={`Одобрено постов: ${approveAll.data}`}>
          Они в <Link to="/posts">«Постах»</Link>, картинки прикрепляются сами.
        </Banner>
      ) : null}
      {approveAll.isError ? (
        <Banner tone="error" title="Одобрены не все">
          Часть постов не одобрилась, сервер ничего не изменил для остальных. Повторите.
        </Banner>
      ) : null}
      <ol className={styles.seriesList}>
        {posts.map((post) => (
          <SeriesPost key={post.id} event={event} post={post} busy={approveAll.isPending} />
        ))}
      </ol>
    </section>
  );
}
