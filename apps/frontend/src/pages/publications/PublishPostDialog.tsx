import type { PostDto } from '@alexeev/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { PublishDialog, publicationCopy } from '../../features/publications';
import { postsInfiniteQueryOptions } from '../../features/posts';
import { Button, Dialog, EmptyState, Select, Skeleton } from '../../shared/ui';

const copy = publicationCopy.picker;

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenPosts: () => void;
  timezone?: string;
};

/** «Опубликовать пост»: pick an approved post, then the existing publish dialog (channel, time, confirmation). */
export function PublishPostDialog({ isOpen, onOpenChange, onOpenPosts, timezone }: Props) {
  const posts = useInfiniteQuery({
    ...postsInfiniteQueryOptions({ view: 'live', status: 'approved' }),
    enabled: isOpen
  });
  const approved = useMemo<PostDto[]>(
    () => posts.data?.pages.flatMap((page) => page.items).filter((post) => post.status === 'approved') ?? [],
    [posts.data]
  );
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const picked = approved.find((post) => post.id === pickedId) ?? null;
  const [chosen, setChosen] = useState<PostDto | null>(null);

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
                setChosen(picked);
                onOpenChange(false);
                setPublishOpen(true);
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
        ) : approved.length === 0 ? (
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
            options={approved.map((post) => ({ id: post.id, label: post.title.trim() || '—' }))}
            value={pickedId}
            onChange={setPickedId}
          />
        )}
      </Dialog>
      {chosen ? (
        <PublishDialog post={chosen} timezone={timezone} isOpen={publishOpen} onOpenChange={setPublishOpen} />
      ) : null}
    </>
  );
}
