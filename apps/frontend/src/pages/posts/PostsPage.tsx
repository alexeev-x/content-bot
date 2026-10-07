import { PostsList, postsCopy, type PostsView } from '../../features/posts';
import { Button, PageHeader } from '../../shared/ui';
import { useDocumentTitle } from './use-document-title';

type Props = {
  view: PostsView;
  query: string;
  onViewChange: (view: PostsView) => void;
  onQueryChange: (query: string) => void;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onReconcile: (postId: string) => void;
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
