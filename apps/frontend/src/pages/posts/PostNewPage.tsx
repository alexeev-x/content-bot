import type { PostDto } from '@alexeev/contracts';
import { describeSlotIntent, type CalendarSlotIntent } from '../../features/calendar';
import { PostEditor, postsCopy } from '../../features/posts';
import { Banner } from '../../shared/ui';
import { useDocumentTitle } from './use-document-title';

type Props = { onCreated: (post: PostDto) => void; slotIntent?: CalendarSlotIntent };

export function PostNewPage({ onCreated, slotIntent }: Props) {
  useDocumentTitle(postsCopy.editor.newTitle);
  const intent =
    slotIntent?.slot && slotIntent.timezone
      ? describeSlotIntent(slotIntent.slot, slotIntent.timezone, slotIntent.fold)
      : null;
  return (
    <>
      {intent ? (
        <Banner title="Черновик для выбранного времени" tone="info">
          Время публикации: {intent}. Сохранение создаст только черновик. Чтобы запланировать публикацию, продолжите
          через отдельное подтверждение публикации.
        </Banner>
      ) : null}
      <PostEditor onCreated={onCreated} />
    </>
  );
}
