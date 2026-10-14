import { POST_MEDIA_MAX_ITEMS, type PostMediaDto } from '@alexeev/contracts';
import type { RefObject } from 'react';
import { Button, Dialog } from '../../../shared/ui';
import { ServerPreview } from './ServerPreview';

type Props = {
  media: PostMediaDto | null;
  onClose: () => void;
  onCrop: (media: PostMediaDto) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  entryCount: number;
  isDisabled: boolean;
};

/** Full-size preview of one attachment with its crop and replace actions. */
export function MediaExpandedDialog({ media, onClose, onCrop, inputRef, entryCount, isDisabled }: Props) {
  return (
    <Dialog
      isOpen={media !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={media?.fileName ?? 'Предпросмотр медиа'}
      description="Полноразмерный предпросмотр вложения."
      size="wide"
      footer={
        media ? (
          <>
            <Button variant="secondary" onPress={onClose}>
              Закрыть
            </Button>
            {media.kind === 'photo' ? (
              <Button variant="secondary" isDisabled={isDisabled} onPress={() => onCrop(media)}>
                Кадрировать
              </Button>
            ) : null}
            <Button
              variant="secondary"
              aria-label={`Заменить ${media.fileName}`}
              isDisabled={isDisabled || entryCount >= POST_MEDIA_MAX_ITEMS}
              onPress={() => {
                if (inputRef.current) inputRef.current.dataset.replaceId = media.id;
                onClose();
                inputRef.current?.click();
              }}
            >
              Заменить
            </Button>
          </>
        ) : null
      }
    >
      {media ? <ServerPreview media={media} large /> : null}
    </Dialog>
  );
}
