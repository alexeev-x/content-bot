import { Button, Icon } from '../../../shared/ui';
import { ProgressBar } from '../../../shared/ui/Progress';
import type { UploadEntry } from '../model/use-library-upload';
import styles from './MediaLibrary.module.css';

type Props = {
  entry: UploadEntry;
  onRetry: () => void;
  onRemove: () => void;
};

function statusText(entry: UploadEntry): string {
  if (entry.status === 'failed') return entry.error ?? 'Не удалось загрузить файл';
  if (entry.status === 'queued') return 'В очереди';
  return entry.status === 'done' ? 'Загружено' : `Загрузка… ${entry.progress}%`;
}

function Actions({ entry, onRetry, onRemove }: Props) {
  if (entry.status !== 'failed') return null;
  return (
    <span className={styles.uploadActions}>
      {entry.retryable ? (
        <Button variant="secondary" size="sm" onPress={onRetry} aria-label={`Повторить загрузку ${entry.file.name}`}>
          Повторить
        </Button>
      ) : null}
      <Button variant="secondary" size="sm" onPress={onRemove} aria-label={`Убрать ${entry.file.name}`}>
        Убрать
      </Button>
    </span>
  );
}

function Status({ entry }: { entry: UploadEntry }) {
  return (
    <output className={styles.uploadStatus} data-failed={entry.status === 'failed' || undefined}>
      {entry.status === 'uploading' || entry.status === 'queued' ? (
        <ProgressBar label={entry.file.name} value={entry.status === 'queued' ? 0 : entry.progress} />
      ) : null}
      <span className={styles.meta}>{statusText(entry)}</span>
    </output>
  );
}

/** Same box as MediaCard, so the real item replaces it without moving the grid. */
export function UploadCard(props: Props) {
  const { entry } = props;
  return (
    <li className={styles.card} data-upload={entry.status}>
      <div className={styles.cardButton}>
        <span className={styles.preview} aria-hidden="true">
          <Icon name={entry.status === 'failed' ? 'alert' : 'image'} size={28} />
        </span>
        <span className={styles.name} title={entry.file.name}>
          {entry.file.name}
        </span>
        <Status entry={entry} />
        <Actions {...props} />
      </div>
    </li>
  );
}

export function UploadListRow(props: Props) {
  const { entry } = props;
  return (
    <li className={styles.uploadRow} data-upload={entry.status}>
      <span className={`${styles.preview} ${styles.listPreview}`} aria-hidden="true">
        <Icon name={entry.status === 'failed' ? 'alert' : 'image'} size={24} />
      </span>
      <span className={styles.listText}>
        <span className={styles.name} title={entry.file.name}>
          {entry.file.name}
        </span>
        <Status entry={entry} />
      </span>
      <Actions {...props} />
    </li>
  );
}
