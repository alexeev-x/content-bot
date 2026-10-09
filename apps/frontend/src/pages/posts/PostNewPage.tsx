import type { PostDto } from '@alexeev/contracts';
import { PostEditor, postsCopy } from '../../features/posts';
import { useDocumentTitle } from './use-document-title';

type Props = { onCreated: (post: PostDto) => void };

export function PostNewPage({ onCreated }: Props) {
  useDocumentTitle(postsCopy.editor.newTitle);
  return <PostEditor onCreated={onCreated} />;
}
