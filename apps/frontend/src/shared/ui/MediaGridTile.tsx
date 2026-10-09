import { useState, type ReactNode } from 'react';
import { Button as AriaButton, ToggleButton } from 'react-aria-components';
import { Icon } from './Icon';
import { ProgressRing } from './Progress';
import styles from './MediaGridTile.module.css';

export type MediaTileKind = 'image' | 'video';
export type MediaTileState = 'ready' | 'queued' | 'uploading' | 'done' | 'failed';

type Props = {
  /** Accessible name of the tile (usually the file name); the overlays are decorative. */
  label: string;
  /** Photo or video poster. Without it, or when it fails, the tile shows the type icon: the box never collapses. */
  src?: string | undefined;
  kind?: MediaTileKind;
  /** Video length, «01:24»: shown in the bottom-left chip. */
  duration?: string;
  /** `ready` is a plain attached file; `queued`, `uploading` (with `progress`), `done` and `failed` are upload states. */
  state?: MediaTileState;
  /** 0–100, only for `uploading`. */
  progress?: number;
  /** Text of a non-ready state («В очереди», «Загружено», «Ошибка»): state is never colour or icon alone. */
  stateLabel?: string;
  /** Presses the tile (open the tile menu / crop). Ignored when `selectable`. */
  onPress?: () => void;
  /** Top-right «×»; provide `removeLabel` with it («Убрать из поста: altai_lake.jpg»). */
  onRemove?: () => void;
  removeLabel?: string;
  /** Failed state: retry button under the label. */
  onRetry?: () => void;
  retryLabel?: string;
  /** The tile is a checkbox-like toggle with a checkmark (library picker); `onPress` and the handle are not used. */
  selectable?: boolean;
  isSelected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  /** Top-left slot for a drag handle; the feature owns the drag behaviour and keyboard. */
  handle?: ReactNode;
  /** Fills the grid cell (phone 3-column grid) instead of the fixed token size (124 px, 104 px on phone). */
  fluid?: boolean;
  isDisabled?: boolean;
};

/** Square media tile of the strip and the grid: photo or poster, type badge, duration, play circle, upload state, remove. */
export function MediaGridTile({
  label,
  src,
  kind = 'image',
  duration,
  state = 'ready',
  progress,
  stateLabel,
  onPress,
  onRemove,
  removeLabel,
  onRetry,
  retryLabel,
  selectable = false,
  isSelected = false,
  onSelectedChange,
  handle,
  fluid = false,
  isDisabled
}: Props) {
  const [failedSrc, setFailedSrc] = useState<string | undefined>(undefined);
  const showImage = Boolean(src) && failedSrc !== src;
  const picture = (
    <>
      {showImage ? (
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailedSrc(src)} />
      ) : (
        <span className={styles.fallback} aria-hidden="true">
          <Icon name={kind === 'video' ? 'video' : 'image'} size={28} />
        </span>
      )}
      {kind === 'video' && state !== 'uploading' && state !== 'failed' ? (
        <span className={styles.play} aria-hidden="true">
          <Icon name="play" size={20} fill="currentColor" />
        </span>
      ) : null}
      <span className={styles.badge} aria-hidden="true">
        <Icon name={kind === 'video' ? 'video' : 'image'} size={14} />
        {duration ? <span className={styles.duration}>{duration}</span> : null}
      </span>
      {selectable ? (
        <span className={styles.check} aria-hidden="true">
          {isSelected ? <Icon name="check" size={14} strokeWidth={2.5} /> : null}
        </span>
      ) : null}
    </>
  );

  return (
    <div
      className={styles.tile}
      data-fluid={fluid || undefined}
      data-state={state}
      data-selected={isSelected || undefined}
      data-disabled={isDisabled || undefined}
    >
      {selectable ? (
        <ToggleButton
          aria-label={label}
          isSelected={isSelected}
          onChange={onSelectedChange}
          isDisabled={isDisabled}
          className={styles.surface}
        >
          {picture}
        </ToggleButton>
      ) : (
        <AriaButton aria-label={label} onPress={onPress} isDisabled={isDisabled || !onPress} className={styles.surface}>
          {picture}
        </AriaButton>
      )}
      {state === 'uploading' ? (
        <span className={styles.state}>
          <ProgressRing label={stateLabel ?? label} value={progress} size={44} />
        </span>
      ) : null}
      {state === 'done' ? (
        <span className={styles.state} data-tone="done">
          <span className={styles.stateIcon}>
            <Icon name="check-circle" size={28} />
          </span>
          {stateLabel ? <span className={styles.stateText}>{stateLabel}</span> : null}
        </span>
      ) : null}
      {state === 'queued' ? (
        <span className={styles.state}>
          <Icon name="clock" size={22} />
          {stateLabel ? <span className={styles.stateText}>{stateLabel}</span> : null}
        </span>
      ) : null}
      {state === 'failed' ? (
        <span className={styles.state} data-tone="failed">
          <span className={styles.stateIcon}>
            <Icon name="alert" size={24} />
          </span>
          {stateLabel ? <span className={styles.stateText}>{stateLabel}</span> : null}
          {onRetry && retryLabel ? (
            <AriaButton aria-label={retryLabel} onPress={onRetry} className={styles.retry}>
              <Icon name="retry" size={16} />
            </AriaButton>
          ) : null}
        </span>
      ) : null}
      {handle ? <span className={styles.handle}>{handle}</span> : null}
      {onRemove && removeLabel && !selectable ? (
        <AriaButton aria-label={removeLabel} onPress={onRemove} isDisabled={isDisabled} className={styles.remove}>
          <span className={styles.removeDot} aria-hidden="true">
            <Icon name="x" size={12} strokeWidth={2.5} />
          </span>
        </AriaButton>
      ) : null}
    </div>
  );
}

type AddProps = {
  /** Visible label («Добавить файлы»). */
  label: string;
  onPress: () => void;
  isDisabled?: boolean;
  fluid?: boolean;
};

/** The dashed «+» tile that opens the add-media flow; same box as MediaGridTile. */
export function MediaAddTile({ label, onPress, isDisabled, fluid = false }: AddProps) {
  return (
    <AriaButton
      onPress={onPress}
      isDisabled={isDisabled}
      data-fluid={fluid || undefined}
      className={`${styles.tile} ${styles.add}`}
    >
      <Icon name="plus" size={24} />
      <span className={styles.addLabel}>{label}</span>
    </AriaButton>
  );
}
