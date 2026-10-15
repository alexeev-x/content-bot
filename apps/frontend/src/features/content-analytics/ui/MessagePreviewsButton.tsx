import { Button, useToast } from '../../../shared/ui';
import { useSendMessagePreviews } from '../api/content-analytics-queries';
import { copy } from './copy';

/** Sends every bot alert in each candidate style to the owner's chat, to choose how alerts should look. */
export function MessagePreviewsButton() {
  const send = useSendMessagePreviews();
  const toast = useToast();
  return (
    <Button
      variant="secondary"
      icon="send"
      isLoading={send.isPending}
      onPress={() =>
        send.mutate(undefined, {
          onSuccess: (result) => toast.show({ tone: 'success', title: copy.previewsSent(result.sent) }),
          onError: () => toast.show({ tone: 'error', title: copy.previewsFailed })
        })
      }
    >
      {copy.previews}
    </Button>
  );
}
