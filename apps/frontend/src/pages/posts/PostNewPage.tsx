import type { PostDto } from '@alexeev/contracts';
import { PostEditor, postsCopy } from '../../features/posts';
import { useDocumentTitle } from '../../app/use-document-title';

type Props = { onCreated: (post: PostDto) => void; initialTab?: 'poll' | undefined };

export function PostNewPage({ onCreated, initialTab }: Props) {
  useDocumentTitle(postsCopy.editor.newTitle);
  return <PostEditor onCreated={onCreated} initialTab={initialTab} />;
}
