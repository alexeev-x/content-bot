import { PostsList, postsCopy, type PostsSort, type PostsView } from '../../features/posts';
import { Button, PageHeader, useMediaQuery } from '../../shared/ui';
import { useDocumentTitle } from '../../app/use-document-title';

type Props = {
  view: PostsView;
  query: string;
  sort: PostsSort;
  page: number;
  onPageChange: (page: number) => void;
  onViewChange: (view: PostsView) => void;
  onQueryChange: (query: string) => void;
  onSortChange: (sort: PostsSort) => void;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onReconcile: (postId: string) => void;
};

export function PostsPage({ onCreate, ...list }: Props) {
  useDocumentTitle(postsCopy.list.title);
  const phone = useMediaQuery('(max-width: 859px)');
  return (
    <>
      <PageHeader
        title={postsCopy.list.title}
        focusHeadingOnMount
        actions={
          // On a phone the tab bar's «+» creates a post: no second button on the page.
          phone ? undefined : (
            <Button icon="plus" onPress={onCreate}>
              {postsCopy.list.create}
            </Button>
          )
        }
      />
      <PostsList {...list} onCreate={onCreate} />
    </>
  );
}
