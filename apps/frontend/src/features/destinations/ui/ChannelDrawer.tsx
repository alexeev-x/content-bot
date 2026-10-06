import { useQuery } from '@tanstack/react-query';
import { ApiError } from '../../../shared/api/http-client';
import { Button, Drawer, ErrorState, Skeleton, StatusBadge } from '../../../shared/ui';
import { destinationQueryOptions } from '../api/destinations-queries';
import { describeFailure } from '../model/check-failure';
import { ChannelEditor } from './ChannelEditor';
import { channelsCopy } from './copy';
import styles from './ChannelDrawer.module.css';

const copy = channelsCopy.drawer;

type Props = {
  /** The channel to show; `null` keeps the drawer closed. */
  channelId: string | null;
  onClose: () => void;
  onOpenOther: (id: string) => void;
  /** Reports what a rights check found, so the list can show it. */
  onRightsKnown: (id: string, botCanPost: boolean) => void;
};

export function ChannelDrawer({ channelId, onClose, onOpenOther, onRightsKnown }: Props) {
  return (
    <ChannelDrawerBody
      // Remount per channel: form state of one channel never leaks into another.
      key={channelId ?? 'closed'}
      channelId={channelId}
      onClose={onClose}
      onOpenOther={onOpenOther}
      onRightsKnown={onRightsKnown}
    />
  );
}

function ChannelDrawerBody({ channelId, onClose, onOpenOther, onRightsKnown }: Props) {
  const query = useQuery({ ...destinationQueryOptions(channelId ?? ''), enabled: channelId !== null });
  const destination = query.data;
  const missing = query.error instanceof ApiError && describeFailure(query.error).kind === 'not_found_destination';
  const title = destination?.title ?? copy.loading;

  return (
    <Drawer
      isOpen={channelId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={title}
      meta={destination ? <StatusBadge status={destination.enabled ? 'ok' : 'paused'} /> : undefined}
    >
      {destination && channelId ? (
        <ChannelEditor
          destination={destination}
          onOpenOther={onOpenOther}
          onRightsKnown={(botCanPost) => onRightsKnown(channelId, botCanPost)}
        />
      ) : query.isError ? (
        <ErrorState
          title={missing ? copy.notFound.title : copy.loadFailed}
          message={missing ? copy.notFound.message : channelsCopy.list.error}
          requestId={query.error instanceof ApiError ? query.error.requestId : undefined}
          {...(missing ? {} : { onRetry: () => void query.refetch() })}
          action={
            <Button variant="secondary" onPress={onClose}>
              {copy.close}
            </Button>
          }
        />
      ) : (
        <div className={styles.loading} aria-busy="true">
          <Skeleton height={44} />
          <Skeleton height={72} />
          <Skeleton height={44} />
        </div>
      )}
    </Drawer>
  );
}
