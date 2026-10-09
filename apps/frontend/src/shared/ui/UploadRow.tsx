import { useState } from 'react';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { ProgressBar, ProgressRing } from './Progress';
import styles from './UploadRow.module.css';

export type UploadRowState = 'queued' | 'uploading' | 'ready' | 'failed';

type Props = {
  name: string;
  /** Muted line: «4.2 МБ • 4032 × 3024 • 01:24». */
  meta?: string;
  src?: string | undefined;
  kind?: 'image' | 'video';
  state: UploadRowState;
  /** 0–100 for `uploading`. */
  progress?: number;
  /** Status text: «В очереди», «Загрузка…», «Готов к добавлению», «.pdf — формат не поддерживается». Always shown. */
  statusLabel: string;
  onRemove?: () => void;
  removeLabel?: string;
  /** `square` 64 px (default) or `landscape` 120 × 62 flush with the row's left edge (post editor). */
  thumb?: 'square' | 'landscape';
};

/** Queue row of the add-media dialog: 64 px thumbnail, name and meta, status column with progress, remove. Bordered, radius card. */
export function UploadRow({
  name,
  meta,
  src,
  kind = 'image',
  state,
  progress,
  statusLabel,
  onRemove,
  removeLabel,
  thumb = 'square'
}: Props) {
  const [failedSrc, setFailedSrc] = useState<string | undefined>(undefined);
  const showImage = Boolean(src) && failedSrc !== src;
  return (
    <div className={styles.row} data-state={state} data-thumb={thumb}>
      <span className={styles.thumb} aria-hidden="true">
        {showImage ? (
          <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailedSrc(src)} />
        ) : (
          <Icon name={kind === 'video' ? 'video' : 'image'} size={24} />
        )}
        {kind === 'video' ? (
          <span className={styles.play}>
            <Icon name="play" size={14} fill="currentColor" />
          </span>
        ) : null}
      </span>
      <span className={styles.text}>
        <span className={styles.name} title={name}>
          {name}
        </span>
        {meta ? <span className={styles.meta}>{meta}</span> : null}
      </span>
      <span className={styles.status}>
        {state === 'uploading' ? (
          <>
            <span className={styles.statusLine}>
              <ProgressRing label={name} value={progress} size={20} showValue={false} surface="flat" />
              <span className={styles.statusText}>{statusLabel}</span>
              {progress === undefined ? null : <span className={styles.percent}>{Math.round(progress)}%</span>}
            </span>
            <ProgressBar label={name} value={progress} />
          </>
        ) : (
          <span className={styles.statusLine}>
            {state === 'ready' ? <Icon name="check-circle" size={18} /> : null}
            {state === 'failed' ? <Icon name="alert" size={18} /> : null}
            {state === 'queued' ? <Icon name="clock" size={18} /> : null}
            <span className={styles.statusText}>{statusLabel}</span>
          </span>
        )}
      </span>
      {onRemove && removeLabel ? (
        <IconButton label={removeLabel} icon="x" size="sm" showTooltip={false} onPress={onRemove} />
      ) : null}
    </div>
  );
}
