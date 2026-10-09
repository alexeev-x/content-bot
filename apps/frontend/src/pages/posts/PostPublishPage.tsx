import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { PublicationSettings } from '../../features/publications';
import { messageLength, PostPreview, postQueryOptions, postsCopy } from '../../features/posts';
import { Button, ErrorState, PageHeader, Panel, Skeleton, StatusBadge, Banner } from '../../shared/ui';
import { BackToPosts } from './BackToPosts';
import { useDocumentTitle } from './use-document-title';
import styles from './PostPages.module.css';

type Props = { id: string };

export function PostPublishPage({ id }: Props) {
  const query = useQuery(postQueryOptions(id));
  const navigate = useNavigate();
  useDocumentTitle(query.data ? `Публикация: ${query.data.title}` : 'Настройки публикации');

  if (query.isPending) {
    return (
      <div className={styles.skeleton} aria-busy="true">
        <BackToPosts />
        <Skeleton height={36} width="50%" />
        <Panel>
          <Skeleton lines={5} height={20} />
        </Panel>
      </div>
    );
  }
  if (query.isError) {
    return (
      <>
        <BackToPosts />
        <ErrorState
          title={postsCopy.editor.loadError}
          message={postsCopy.editor.loadErrorMessage}
          onRetry={() => void query.refetch()}
        />
      </>
    );
  }

  const post = query.data;
  const length = messageLength(post.title, post.body);
  const limit = post.media.length > 0 ? 1024 : 4096;
  const unsupported = post.media.length > 1 && post.media.some((item) => item.kind === 'animation');
  const ready = post.status === 'approved' && length <= limit && !unsupported;

  return (
    <>
      <BackToPosts />
      <PageHeader title="Настройки публикации" />
      {post.status !== 'approved' ? (
        <Banner tone="warning" title="Сначала подготовьте пост">
          Черновик нельзя отправить напрямую. Вернитесь в редактор, сохраните изменения и подтвердите подготовку
          публикации.
          <Button variant="secondary" onPress={() => void navigate({ to: '/posts/$id', params: { id } })}>
            Вернуться в редактор
          </Button>
        </Banner>
      ) : null}
      {length > limit ? (
        <Banner tone="error" title="Текст не помещается в сообщение Telegram">
          {post.media.length > 0
            ? `Подпись с медиа ограничена ${limit} символами. Сократите текст до лимита; он не будет обрезан или разделён.`
            : `Текст ограничен ${limit} символами. Сократите его перед публикацией.`}
        </Banner>
      ) : null}
      {unsupported ? (
        <Banner tone="error" title="GIF нельзя добавить в этот альбом">
          Уберите GIF или создайте для него отдельную публикацию. Остальные медиа останутся в черновике.
        </Banner>
      ) : null}
      <div className={styles.publishFlow}>
        <div className={styles.publishHeading}>
          <div>
            <h2>Проверьте публикацию</h2>
            <p className={styles.muted}>Ничего не отправится, пока вы не подтвердите действие в следующем окне.</p>
          </div>
          <StatusBadge status={post.status} />
        </div>
        <PostPreview
          title={post.title}
          body={post.body}
          entities={post.entities}
          length={length}
          limit={limit}
          media={post.media}
        />
        <div className={styles.publishActions}>
          <Button variant="secondary" onPress={() => void navigate({ to: '/posts/$id', params: { id } })}>
            Назад к редактору
          </Button>
        </div>
        {ready ? <PublicationSettings post={post} /> : null}
      </div>
    </>
  );
}
