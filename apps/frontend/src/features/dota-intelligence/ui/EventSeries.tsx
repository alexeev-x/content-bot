import type { SourceEventDto, SourceEventSeriesDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ApiError } from '../../../shared/api/http-client';
import { Banner, Button, ErrorState, Icon, LoadingImage, Skeleton, VisuallyHidden } from '../../../shared/ui';
import { sourceEventSeriesQueryOptions, useApproveSourceEventSeriesPost } from '../api/sources-queries';
import styles from './SourceEventDrawer.module.css';

type Post = SourceEventSeriesDto['posts'][number];
const isVideo = (url: string) => /\.mp4$/i.test(url);

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

function SeriesPost({ event, post }: { event: SourceEventDto; post: Post }) {
  const navigate = useNavigate();
  const approve = useApproveSourceEventSeriesPost();
  const draft = post.draft;
  const postId = draft?.postId ?? null;
  const notAPost = approve.error instanceof ApiError && approve.error.reason === 'NOT_A_POST';
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
          {draft.text ? <p className={styles.aiDraftText}>{draft.text}</p> : null}
          <Media urls={post.media} />
          {approve.error ? (
            <Banner tone="error" title="Не получилось">
              {notAPost
                ? 'Текст не влезает в пост. Сократите его в редакторе после одобрения или напишите серию заново.'
                : 'Сервер не подтвердил одобрение, ничего не изменилось. Повторите.'}
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
              <Button
                variant="primary"
                icon="check-circle"
                isLoading={approve.isPending}
                onPress={() =>
                  approve.mutate(
                    { id: event.id, postId: post.id, versionId: draft.versionId },
                    { onSuccess: (result) => void navigate({ to: '/posts/$id', params: { id: result.postId } }) }
                  )
                }
              >
                Одобрить
              </Button>
            )}
          </div>
        </>
      )}
    </li>
  );
}

/** The event's planned series (owner, 21.10.2026: several logical posts, not one): each post approved on its own. */
export function EventSeries({ event, seriesId }: { event: SourceEventDto; seriesId: string }) {
  const series = useQuery(sourceEventSeriesQueryOptions(event.id, seriesId));
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
  return (
    <section className={styles.aiDraft} aria-labelledby={`series-${event.id}`}>
      <h3 id={`series-${event.id}`} className={styles.aiDraftTitle}>
        Серия постов: {posts.length}
      </h3>
      <p className={styles.muted}>
        {writing > 0
          ? `ИИ пишет посты по странице события: готово ${posts.length - writing} из ${posts.length}.`
          : 'Каждый пост одобряется отдельно и становится постом в студии со своими картинками.'}
      </p>
      <ol className={styles.seriesList}>
        {posts.map((post) => (
          <SeriesPost key={post.id} event={event} post={post} />
        ))}
      </ol>
    </section>
  );
}
