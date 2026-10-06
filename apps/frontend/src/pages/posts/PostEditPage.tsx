import type { PostDto, PublicationDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { displayStatus, PublishDialog } from '../../features/publications';
import { PostEditor, postQueryOptions, postsCopy } from '../../features/posts';
import { classifyApiError } from '../../shared/api/error-kind';
import { ApiError } from '../../shared/api/http-client';
import { Button, Card, ErrorState, PageHeader, Skeleton, StatusBadge } from '../../shared/ui';
import { BackToPosts } from './BackToPosts';
import { PostPublications } from './PostPublications';
import styles from './PostPages.module.css';
import { useDocumentTitle } from './use-document-title';

type Props = { id: string };

const copy = postsCopy;

export function PostEditPage({ id }: Props) {
  const query = useQuery(postQueryOptions(id));
  const navigate = useNavigate();
  useDocumentTitle(query.data?.title.trim() || copy.editor.untitled);

  if (query.isPending) {
    return (
      <div className={styles.skeleton} aria-busy="true">
        <BackToPosts />
        <Skeleton height={36} width="50%" />
        <div className={styles.skeletonPanes}>
          <Card>
            <Skeleton lines={6} height={20} />
          </Card>
          <Card>
            <Skeleton lines={4} height={20} />
          </Card>
        </div>
      </div>
    );
  }

  if (query.isError) {
    const notFound = classifyApiError(query.error) === 'not_found';
    return (
      <>
        <BackToPosts />
        <ErrorState
          title={notFound ? copy.editor.notFoundTitle : copy.editor.loadError}
          message={notFound ? copy.editor.notFoundMessage : copy.editor.loadErrorMessage}
          requestId={query.error instanceof ApiError ? query.error.requestId : undefined}
          onRetry={notFound ? undefined : () => void query.refetch()}
          action={
            notFound ? (
              <Button variant="secondary" onPress={() => void navigate({ to: '/posts', search: {} })}>
                {copy.editor.back}
              </Button>
            ) : undefined
          }
        />
      </>
    );
  }

  return (
    <>
      <div>
        <BackToPosts />
        <PageHeader title={query.data.title.trim() || copy.editor.untitled} />
      </div>
      <PostEditor
        key={id}
        post={query.data}
        approvedActions={(post) => <PublishAction post={post} />}
        aside={<PostPublications postId={id} />}
      />
    </>
  );
}

function PublishAction({ post }: { post: PostDto }) {
  const [isOpen, setOpen] = useState(false);
  const [published, setPublished] = useState<PublicationDto | null>(null);
  return (
    <>
      <Button icon="send" onPress={() => setOpen(true)}>
        {copy.publications.publish}
      </Button>
      {/* 202 is not «sent»: only the status the server returned is shown. */}
      {published ? (
        <span className={styles.publishStatus}>
          {copy.publications.created}: <StatusBadge status={displayStatus(published)} />
        </span>
      ) : null}
      <PublishDialog post={post} isOpen={isOpen} onOpenChange={setOpen} onPublished={setPublished} />
    </>
  );
}
