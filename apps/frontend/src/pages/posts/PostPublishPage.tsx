import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { PublicationSettings, type EnsureApproved } from '../../features/publications';
import { useOwnerTimezone } from '../../features/owner-settings';
import { messageLength, PostPreview, postQueryOptions, postsCopy, useApprovePost } from '../../features/posts';
import { ErrorState, IconButton, PageHeader, Panel, Skeleton, Banner, useMediaQuery } from '../../shared/ui';
import { BackToPosts } from './BackToPosts';
import { classifyApiError } from '../../shared/api/error-kind';
import { ApiError } from '../../shared/api/http-client';
import { useDocumentTitle } from '../../app/use-document-title';
import styles from './PostPages.module.css';

type Props = { id: string };

export function PostPublishPage({ id }: Props) {
  const query = useQuery(postQueryOptions(id));
  const navigate = useNavigate();
  const narrow = useMediaQuery('(max-width: 859px)');
  const timezone = useOwnerTimezone();
  const approve = useApprovePost();
  useDocumentTitle(query.data ? `Публикация: ${query.data.title}` : 'Настройки публикации');

  const ensureApproved: EnsureApproved = async (draft) => {
    const copy = postsCopy.editor;
    try {
      const approved = await approve.mutateAsync({ id: draft.id, input: { revision: draft.revision } });
      return { ok: true, post: approved };
    } catch (error) {
      const kind = classifyApiError(error);
      const message =
        kind === 'empty_body'
          ? copy.validation.emptyBody
          : kind === 'stale_revision' || kind === 'not_editable' || kind === 'already_approved'
            ? 'Пост изменился на сервере. Вернитесь в редактор и откройте актуальную версию.'
            : 'Пост не подтверждён и не опубликован. Повторите попытку.';
      const requestId = error instanceof ApiError && error.requestId ? ` Код запроса: ${error.requestId}.` : '';
      return { ok: false, title: copy.errors.approveTitle, message: `${message}${requestId}` };
    }
  };

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
        <PublicationSettings
          timezone={timezone}
          post={post}
          onBack={() => void navigate({ to: '/posts/$id', params: { id } })}
          ensureApproved={ensureApproved}
          onPublished={(publication) => void navigate({ to: '/publications', search: { id: publication.id } })}
        >
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
