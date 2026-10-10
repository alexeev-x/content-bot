import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { PublicationSettings } from '../../features/publications';
import { messageLength, PostPreview, postQueryOptions, postsCopy } from '../../features/posts';
import { Button, ErrorState, IconButton, PageHeader, Panel, Skeleton, Banner, useMediaQuery } from '../../shared/ui';
import { BackToPosts } from './BackToPosts';
import { useDocumentTitle } from './use-document-title';
import styles from './PostPages.module.css';

type Props = { id: string };

export function PostPublishPage({ id }: Props) {
  const query = useQuery(postQueryOptions(id));
  const navigate = useNavigate();
  const narrow = useMediaQuery('(max-width: 859px)');
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

  return (
    <>
      <PageHeader
        title="Публикация"
        tools={null}
        actions={
          <IconButton
            label="Закрыть и вернуться к редактору"
            icon={narrow ? 'arrow-left' : 'x'}
            onPress={() => void navigate({ to: '/posts/$id', params: { id } })}
          />
        }
      />
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
      <div>
        <PublicationSettings post={post} onBack={() => void navigate({ to: '/posts/$id', params: { id } })}>
          <PostPreview
            title={post.title}
            body={post.body}
            entities={post.entities}
            length={length}
            limit={limit}
            media={post.media}
          />
        </PublicationSettings>
      </div>
    </>
  );
}
