import type { PublicationDto } from '@alexeev/contracts';
import { now, parseAbsolute } from '@internationalized/date';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { browserTimeZone, PublishDialog } from '../../features/publications';
import { postQueryOptions } from '../../features/posts';
import { useToast } from '../../shared/ui';

type Props = {
  publication: PublicationDto | null;
  onClose: () => void;
  timezone?: string | undefined;
};

/**
 * «Отправить снова» for a failed publication and «Запланировать снова» for a cancelled one: the normal publish dialog for the same post and channel. It is a new
 * attempt with its own Idempotency-Key and the usual duplicate check, never a replay of the failed request.
 */
export function ResendPublicationDialog({ publication, onClose, timezone }: Props) {
  const toast = useToast();
  const query = useQuery({ ...postQueryOptions(publication?.postId ?? ''), enabled: publication !== null });
  const failed = publication !== null && query.isError;
  useEffect(() => {
    if (!failed) return;
    toast.show({
      tone: 'error',
      title: 'Не удалось открыть пост',
      description: 'Проверьте соединение и попробуйте ещё раз.'
    });
    onClose();
    // Reacts to the load failing once; toast and onClose are stable enough for that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed]);
  if (!publication || !query.data) return null;
  const zone = timezone ?? browserTimeZone();
  return (
    <PublishDialog
      post={query.data}
      timezone={zone}
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      initialSettings={
        publication.status === 'cancelled'
          ? {
              destinationId: publication.destinationId,
              mode: 'later',
              // The plan it had while still ahead; otherwise an hour from now.
              scheduledAt:
                Date.parse(publication.scheduledAt) > Date.now()
                  ? parseAbsolute(publication.scheduledAt, zone)
                  : now(zone).add({ hours: 1 })
            }
          : { destinationId: publication.destinationId, mode: 'now', scheduledAt: now(zone) }
      }
    />
  );
}
