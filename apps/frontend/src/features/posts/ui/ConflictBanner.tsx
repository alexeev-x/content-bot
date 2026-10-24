import { Banner, Button } from '../../../shared/ui';
import type { EditorConflict } from '../model/use-post-editor';
import { postsCopy } from './copy';
import styles from './PostEditor.module.css';

type Props = {
  conflict: EditorConflict;
  isBusy: boolean;
  onShowServer: () => void;
  onOverwrite: () => void;
  onRetry: () => void;
};

const copy = postsCopy.editor.conflict;

/** 409: the typed text stays where it is. The operator picks a way out; nothing is overwritten on its own. */
export function ConflictBanner({ conflict, isBusy, onShowServer, onOverwrite, onRetry }: Props) {
  const isStale = conflict.kind === 'stale';
  return (
    <Banner
      tone={isStale ? 'conflict' : 'warning'}
      title={isStale ? copy.staleTitle : copy.lockedTitle}
      action={
        <div className={styles.bannerActions}>
          {conflict.status === 'failed' ? (
            <>
              <span>{copy.serverFailed}</span>
              <Button size="sm" variant="secondary" icon="retry" onPress={onRetry}>
                {copy.retryServer}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="secondary" isLoading={conflict.status === 'loading'} onPress={onShowServer}>
              {conflict.status === 'loading' ? copy.loadingServer : copy.showServer}
            </Button>
          )}
          {isStale ? (
            <Button size="sm" variant="secondary" isDisabled={isBusy} onPress={onOverwrite}>
              {copy.overwrite}
            </Button>
          ) : null}
        </div>
      }
    >
      {isStale ? copy.staleBody : copy.lockedBody}
    </Banner>
  );
}
