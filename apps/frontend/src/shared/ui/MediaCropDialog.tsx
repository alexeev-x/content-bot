import { useState, type ReactNode, type RefObject } from 'react';
import { CROP_RATIOS, clampCropFrame, type CropModel, type CropRatio } from '../lib/media-crop';
import { Button } from './Button';
import { CropCanvas } from './CropCanvas';
import { Dialog } from './Dialog';
import { IconButton } from './IconButton';
import { Panel } from './Panel';
import { ProgressBar } from './Progress';
import { RatioTileGroup } from './RatioTileGroup';
import { Slider } from './Slider';
import { TrimPreviewPlayer } from './TrimPreviewPlayer';
import { VideoTrimTimeline } from './VideoTrimTimeline';
import styles from './MediaCropDialog.module.css';

const PHOTO_RATIOS = [
  { id: 'original', label: 'Оригинал', shape: 4 / 3 },
  { id: '1:1', label: '1:1', shape: 1 },
  { id: '4:5', label: '4:5', shape: 4 / 5 },
  { id: '16:9', label: '16:9', shape: 16 / 9 },
  { id: '9:16', label: '9:16', shape: 9 / 16 }
] as const;

type Props = {
  isOpen: boolean;
  kind: 'photo' | 'video';
  narrow: boolean;
  /** The picture the frame is dragged over: the photo, or a poster frame of the video. */
  src: string | null;
  naturalSize: { width: number; height: number } | null;
  model: CropModel;
  onModelChange: (update: (current: CropModel) => CropModel) => void;
  onRatioChange: (ratio: CropRatio) => void;
  onRotate: (delta: -90 | 90) => void;
  onReset: () => void;
  /** Photo only: the canvas that mirrors the saved result. */
  previewCanvas?: RefObject<HTMLCanvasElement | null>;
  /** True while saving: the dialog cannot be dismissed and the controls lock. */
  busy: boolean;
  /** The save action is allowed (loaded, and the caller's own conditions hold). */
  canSave: boolean;
  error: string;
  onSave: () => void;
  onClose: () => void;
  /** Video only: stops the running conversion. */
  onCancelProcessing?: () => void;
  /** Video only, 0–1; `null` when nothing is running. */
  progress?: number | null;
  /** Video only: trim handles in seconds. */
  trim?: {
    duration: number;
    start: number;
    end: number;
    onChange: (start: number, end: number) => void;
    /** The source video, for the range preview. */
    blob: Blob;
    /** Filmstrip thumbnails; `null` while they are being cut. */
    frames: string[] | null;
  };
  /** Desktop side panel content under the photo preview (the editor's cover switch). */
  aside?: ReactNode;
  /** Mobile block under the controls. */
  mobileExtra?: ReactNode;
  loadingLabel: string;
};

/** Crop dialog shared by the post editor and the media library: ratio presets, zoom and rotation for photos, trim and progress for video. */
export function MediaCropDialog({
  isOpen,
  kind,
  narrow,
  src,
  naturalSize,
  model,
  onModelChange,
  onRatioChange,
  onRotate,
  onReset,
  previewCanvas,
  busy,
  canSave,
  error,
  onSave,
  onClose,
  onCancelProcessing,
  progress = null,
  trim,
  aside,
  mobileExtra,
  loadingLabel
}: Props) {
  const isVideo = kind === 'video';
  const ready = src !== null && naturalSize !== null;
  const ratios = PHOTO_RATIOS.map((option) => ({
    ...option,
    label: option.id === 'original' ? (isVideo ? 'Свободно' : narrow ? 'Ориг.' : option.label) : option.label
  }));
  const [previewing, setPreviewing] = useState(false);
  const [playhead, setPlayhead] = useState<number | null>(null);
  // A video also carries the timeline and the ratio row, so its stage is shorter and the footer stays in view.
  const stageHeight = isVideo
    ? narrow
      ? 'min(34dvh, 16rem)'
      : 'clamp(200px, 34vh, 300px)'
    : narrow
      ? 'min(50dvh, 25rem)'
      : 'clamp(280px, 52vh, 420px)';
  const stopPreview = () => {
    setPreviewing(false);
    setPlayhead(null);
  };
  const showPane = !isVideo && !narrow && ready;
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={narrow ? 'Кадрирование' : isVideo ? 'Кадрирование видео' : 'Кадрирование фото'}
      size="media"
      footer={
        <>
          {busy && onCancelProcessing ? (
            <Button variant="secondary" onPress={onCancelProcessing}>
              Отменить обработку
            </Button>
          ) : (
            <Button variant="secondary" isDisabled={busy} onPress={onClose}>
              Отмена
            </Button>
          )}
          <Button variant="secondary" isDisabled={busy} onPress={onReset}>
            Сбросить
          </Button>
          <Button variant="primary" icon="file" isLoading={busy} isDisabled={!canSave} onPress={onSave}>
            Сохранить
          </Button>
        </>
      }
    >
      <span className={styles.marker} aria-hidden="true" />
      {narrow ? (
        <div className={styles.mobileHeader}>
          <Button variant="ghost" size="md" icon="chevron-left" isDisabled={busy} onPress={onClose}>
            Назад
          </Button>
          <strong>Кадрирование</strong>
          <Button variant="primary" size="md" isLoading={busy} isDisabled={!canSave} onPress={onSave}>
            Готово
          </Button>
        </div>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.workspace} data-single={showPane ? undefined : ''}>
        {ready ? (
          <div className={styles.stage}>
            {previewing && trim ? (
              <TrimPreviewPlayer
                blob={trim.blob}
                start={trim.start}
                end={trim.end}
                height={stageHeight}
                onTime={setPlayhead}
                onEnd={stopPreview}
              />
            ) : (
              <CropCanvas
                src={src}
                imageAspect={
                  model.rotation % 180 === 0
                    ? naturalSize.width / naturalSize.height
                    : naturalSize.height / naturalSize.width
                }
                frame={model.frame}
                onFrameChange={(frame) =>
                  onModelChange((current) => ({ ...current, frame: clampCropFrame(frame, current.zoom) }))
                }
                lockedRatio={CROP_RATIOS[model.ratio]}
                zoom={model.zoom}
                rotation={model.rotation}
                handle={narrow ? 'bracket' : 'square'}
                grid="dashed"
                height={stageHeight}
                labels={{
                  region: 'Область кадрирования',
                  corners: {
                    'top-left': 'Левый верхний угол кадрирования',
                    'top-right': 'Правый верхний угол кадрирования',
                    'bottom-left': 'Левый нижний угол кадрирования',
                    'bottom-right': 'Правый нижний угол кадрирования'
                  }
                }}
              />
            )}
          </div>
        ) : error ? null : (
          <output>{loadingLabel}</output>
        )}
        {showPane ? (
          <div className={styles.previewPane}>
            <Panel title="Предпросмотр" headingLevel={3}>
              <div className={styles.previewContent}>
                {previewCanvas ? (
                  <div
                    className={styles.previewImage}
                    style={{ aspectRatio: String(CROP_RATIOS[model.ratio] ?? naturalSize.width / naturalSize.height) }}
                  >
                    <canvas ref={previewCanvas} aria-hidden="true" />
                  </div>
                ) : null}
                {aside}
              </div>
            </Panel>
          </div>
        ) : null}
      </div>
      <RatioTileGroup
        label="Соотношение сторон"
        value={model.ratio}
        options={ratios}
        onChange={(value) => onRatioChange(value as CropRatio)}
      />
      {isVideo ? (
        trim ? (
          <VideoTrimTimeline
            duration={trim.duration}
            range={{ start: trim.start, end: trim.end }}
            onChange={(range) => {
              stopPreview();
              trim.onChange(range.start, range.end);
            }}
            frames={trim.frames}
            playhead={playhead ?? trim.start}
            previewing={previewing}
            onTogglePreview={() => (previewing ? stopPreview() : setPreviewing(true))}
            isDisabled={busy}
          />
        ) : null
      ) : (
        <div className={styles.controlRow}>
          <Slider
            label="Масштаб"
            value={model.zoom}
            onChange={(zoom) =>
              onModelChange((current) => ({ ...current, zoom, frame: clampCropFrame(current.frame, zoom) }))
            }
            min={1}
            max={4}
            step={0.05}
            stepperStep={0.25}
            stepperStyle={narrow ? 'plain' : 'round'}
            pill={narrow}
            decrementLabel="Уменьшить масштаб"
            incrementLabel="Увеличить масштаб"
            valueFormat={{ style: 'percent' }}
          />
          <div className={styles.rotate}>
            <div className={styles.rotateHeading}>
              <span>Повернуть</span>
              {!narrow ? <span aria-live="polite">{model.rotation}°</span> : null}
              {narrow ? (
                <Button variant="ghost" size="sm" onPress={onReset}>
                  Сбросить
                </Button>
              ) : null}
            </div>
            <div className={styles.rotateButtons}>
              <IconButton
                label="Повернуть влево"
                icon="rotate-left"
                variant="secondary"
                size="target"
                isDisabled={busy}
                onPress={() => onRotate(-90)}
              />
              <IconButton
                label="Повернуть вправо"
                icon="rotate-right"
                variant="secondary"
                size="target"
                isDisabled={busy}
                onPress={() => onRotate(90)}
              />
            </div>
          </div>
        </div>
      )}
      {progress !== null ? (
        <output className={styles.progress}>
          <ProgressBar label="Обработка видео" value={Math.round(progress * 100)} />
          <span>Обработка видео: {Math.round(progress * 100)}%</span>
        </output>
      ) : null}
      {narrow ? mobileExtra : null}
    </Dialog>
  );
}
