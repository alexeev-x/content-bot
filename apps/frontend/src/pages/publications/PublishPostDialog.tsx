import { pollIssue, type PostDto } from '@alexeev/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { publicationCopy } from '../../features/publications';
import { postsInfiniteQueryOptions } from '../../features/posts';
import { Button, Dialog, EmptyState, Select, Skeleton } from '../../shared/ui';

const copy = publicationCopy.picker;

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenPosts: () => void;
  /** Opens the post's publish screen (`/posts/$id/publish`). */
  onPublish: (postId: string) => void;
  timezone?: string;
};

/**
 * «Опубликовать пост»: pick a post, then its publish screen (channel, time, confirmation). Drafts are offered too: the
 * publish screen approves a draft together with the send (owner, 18.10.2026: approved-only left nothing to pick, as
 * there is no separate «Одобрить» any more). Drafts with nothing to send yet are left out.
 */
export function PublishPostDialog({ isOpen, onOpenChange, onOpenPosts, onPublish }: Props) {
  const posts = useInfiniteQuery({
    ...postsInfiniteQueryOptions({ view: 'live' }),
    enabled: isOpen
  });
  const ready = useMemo<PostDto[]>(
    () => posts.data?.pages.flatMap((page) => page.items).filter(canBePublished) ?? [],
    [posts.data]
  );
  const [pickedId, setPickedId] = useState<string | null>(null);
  const picked = ready.find((post) => post.id === pickedId) ?? null;

  return (
    <>
      <Dialog
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        title={copy.title}
        description={copy.description}
        footer={
          <>
            <Button variant="secondary" onPress={() => onOpenChange(false)}>
              {copy.cancel}
            </Button>
            <Button
              isDisabled={picked === null}
              onPress={() => {
                if (!picked) return;
                onOpenChange(false);
                // One publish screen for every entry point: the same one the editor's «К публикации» opens.
                onPublish(picked.id);
              }}
            >
              {copy.next}
            </Button>
          </>
        }
      >
        {posts.isPending ? (
          <Skeleton height="var(--size-control)" />
        ) : posts.isError ? (
          <EmptyState
            icon="alert"
            title={copy.error}
            action={
              <Button variant="secondary" onPress={() => void posts.refetch()}>
                {copy.retry}
              </Button>
            }
          />
        ) : ready.length === 0 ? (
          <EmptyState
            icon="file"
            title={copy.emptyTitle}
            description={copy.emptyBody}
            action={<Button onPress={onOpenPosts}>{copy.emptyAction}</Button>}
          />
        ) : (
          <Select
            label={copy.post}
            placeholder={copy.placeholder}
            options={ready.map((post) => ({
              id: post.id,
              label: `${post.title.trim() || '—'}${post.status === 'draft' ? copy.draftSuffix : ''}`
            }))}
            value={pickedId}
            onChange={setPickedId}
          />
        )}
      </Dialog>
    </>
  );
}

function canBePublished(post: PostDto): boolean {
  if (post.status === 'approved') return true;
  if (post.kind === 'poll') return post.poll !== null && pollIssue(post.poll) === null;
  return post.body.trim() !== '' || post.media.length > 0;
}
