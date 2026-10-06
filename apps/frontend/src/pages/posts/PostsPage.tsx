import type { PostStatus } from '@alexeev/contracts';
import { PostsList, postsCopy } from '../../features/posts';
import { Button, PageHeader } from '../../shared/ui';
import { useDocumentTitle } from './use-document-title';

type Props = {
  status: PostStatus | undefined;
  query: string;
  onStatusChange: (status: PostStatus | undefined) => void;
  onQueryChange: (query: string) => void;
  onOpen: (id: string) => void;
  onCreate: () => void;
};

export function PostsPage({ onCreate, ...list }: Props) {
  useDocumentTitle(postsCopy.list.title);
  return (
    <>
      <PageHeader
        title={postsCopy.list.title}
        description={postsCopy.list.description}
        actions={
          <Button icon="plus" onPress={onCreate}>
            {postsCopy.list.create}
          </Button>
        }
      />
      <PostsList {...list} onCreate={onCreate} />
    </>
  );
}
