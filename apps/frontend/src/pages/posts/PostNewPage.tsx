import type { PostDto } from '@alexeev/contracts';
import { PostEditor, postsCopy } from '../../features/posts';
import { PageHeader } from '../../shared/ui';
import { BackToPosts } from './BackToPosts';
import { useDocumentTitle } from './use-document-title';

type Props = { onCreated: (post: PostDto) => void };

export function PostNewPage({ onCreated }: Props) {
  useDocumentTitle(postsCopy.editor.newTitle);
  return (
    <>
      <div>
        <BackToPosts />
        <PageHeader title={postsCopy.editor.newTitle} />
      </div>
      <PostEditor onCreated={onCreated} />
    </>
  );
}
