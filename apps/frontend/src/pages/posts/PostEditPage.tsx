import type { PostDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import {
  DeletePostsDialog,
  deleteBlockOf,
  deleteTargetOf,
  formatExact,
  LifecycleBanner,
  PostEditor,
  postQueryOptions,
  postsCopy,
  useRestoreActions,
  type LifecycleNotice
} from '../../features/posts';
import { classifyApiError } from '../../shared/api/error-kind';
import { ApiError } from '../../shared/api/http-client';
import { Banner, Button, Card, ErrorState, Menu, Skeleton } from '../../shared/ui';
import { BackToPosts } from './BackToPosts';
import { PostPublications } from './PostPublications';
import styles from './PostPages.module.css';
import { useDocumentTitle } from '../../app/use-document-title';

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

  return <LoadedPost post={query.data} />;
}

function LoadedPost({ post }: { post: PostDto }) {
  const id = post.id;
  const navigate = useNavigate();
  const [notice, setNotice] = useState<LifecycleNotice | null>(null);
  const [deleting, setDeleting] = useState(false);
  const restore = useRestoreActions({ onNotice: setNotice });
  const isArchived = post.archivedAt !== null;
  const block = deleteBlockOf(post);
  const date = post.autoDeleteAt ? formatExact(post.autoDeleteAt) : '';

  async function restoreHere() {
    setNotice(null);
    // The page re-renders as a live post once the server-confirmed post lands in the cache.
    if (await restore.restoreOne({ id, revision: post.revision })) {
      queueMicrotask(() => document.querySelector<HTMLElement>('main h1')?.focus());
    }
  }

  return (
    <>
      <PostEditor
        key={`${id}:${post.archivedAt ?? 'live'}`}
        post={post}
        approvedActions={(post) => <PublishAction post={post} />}
        aside={<PostPublications postId={id} />}
        headerActions={
          isArchived ? undefined : (
            <Menu
              label={copy.actions.pageMenu}
              items={[
                {
                  id: 'delete',
                  label: block
                    ? copy.actions.deleteBlocked(
                        block === 'unknown' ? copy.actions.blockedUnknown : copy.actions.blockedInProgress
                      )
                    : copy.actions.delete,
                  icon: 'trash',
                  tone: 'danger',
                  isDisabled: block !== null
                }
              ]}
              onAction={() => {
                setNotice(null);
                setDeleting(true);
              }}
            />
          )
        }
      />
      {notice ? <LifecycleBanner notice={notice} onDismiss={() => setNotice(null)} /> : null}
      {isArchived ? (
        <Banner
          tone="info"
          title={copy.archived.body(date)}
          action={
            <div className={styles.archiveActions}>
              <Button
                size="sm"
                variant="secondary"
                icon="retry"
                isLoading={restore.isPending}
                onPress={() => void restoreHere()}
              >
                {copy.actions.restore}
              </Button>
              <Button size="sm" variant="danger" icon="trash" onPress={() => setDeleting(true)}>
                {copy.actions.deleteNow}
              </Button>
            </div>
          }
        >
          {copy.archived.readOnly}
        </Banner>
      ) : null}
      {deleting ? (
        <DeletePostsDialog
          targets={[deleteTargetOf(post)]}
          onOpenChange={(open) => {
            if (!open) setDeleting(false);
          }}
          onDone={() => void navigate({ to: '/posts', search: {} })}
          onNotice={setNotice}
        />
      ) : null}
    </>
  );
}

function PublishAction({ post }: { post: PostDto }) {
  const navigate = useNavigate();
  return (
    <Button icon="send" onPress={() => void navigate({ to: '/posts/$id/publish', params: { id: post.id } })}>
      {copy.publications.publish}
    </Button>
  );
}
