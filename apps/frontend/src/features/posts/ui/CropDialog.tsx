/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Live status is kept on the existing generic containers for layout and semantics. */
import { Button, CropCanvas, Dialog, IconButton, Panel, RatioTileGroup, Slider, Switch } from '../../../shared/ui';
import { CROP_RATIOS, clampCropFrame, type CropRatio } from '../model/crop';
import type { MediaCrop } from '../model/use-media-crop';
import styles from './PostMediaEditor.module.css';

const cropRatios = [
  { id: 'original', label: 'Оригинал', shape: 4 / 3 },
  { id: '1:1', label: '1:1', shape: 1 },
  { id: '4:5', label: '4:5', shape: 4 / 5 },
  { id: '16:9', label: '16:9', shape: 16 / 9 }
] as const;

type Props = {
  crop: MediaCrop;
  narrow: boolean;
  busy: boolean;
  disabled: boolean;
};

export function CropDialog({ crop, narrow, busy, disabled }: Props) {
  const {
    model,
    naturalSize,
    cropBusy,
    url: cropUrl,
    apply,
    close,
    cover,
    error,
    media,
    previewCanvas,
    reset,
    rotate,
    setAsCover,
    setModel,
    setRatio
  } = crop;
  return (
    <Dialog
      isOpen={media !== null}
      onOpenChange={(open) => {
        if (!open && !cropBusy) close();
      }}
      title={narrow ? 'Кадрирование' : 'Кадрирование фото'}
      size="media"
      footer={
        <>
          <Button variant="secondary" isDisabled={cropBusy} onPress={close}>
            Отмена
          </Button>
          <Button variant="secondary" isDisabled={cropBusy} onPress={reset}>
            Сбросить
          </Button>
          <Button
            variant="primary"
            icon="file"
            isLoading={cropBusy}
            isDisabled={!cropUrl || disabled}
            onPress={() => void apply()}
          >
            Сохранить
          </Button>
        </>
      }
    >
      <span className={styles.cropDialogMarker} aria-hidden="true" />
      {narrow ? (
        <div className={styles.cropMobileHeader}>
          <Button variant="ghost" size="md" icon="chevron-left" onPress={close}>
            Назад
          </Button>
          <strong>Кадрирование</strong>
          <Button
            variant="primary"
            size="md"
            isLoading={cropBusy}
            isDisabled={!cropUrl || disabled || busy}
            onPress={() => void apply()}
          >
            Готово
          </Button>
        </div>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {cropUrl && naturalSize ? (
        <span className={styles.srOnly} role="img" aria-label="Предпросмотр кадрирования" />
      ) : null}
      <div className={styles.cropWorkspace}>
        {cropUrl && naturalSize ? (
          <div className={styles.cropStage}>
            <CropCanvas
              src={cropUrl}
              imageAspect={
                model.rotation % 180 === 0
                  ? naturalSize.width / naturalSize.height
                  : naturalSize.height / naturalSize.width
              }
              frame={model.frame}
              onFrameChange={(frame) =>
                setModel((current) => ({ ...current, frame: clampCropFrame(frame, current.zoom) }))
              }
              lockedRatio={CROP_RATIOS[model.ratio]}
              zoom={model.zoom}
              rotation={model.rotation}
              handle={narrow ? 'bracket' : 'square'}
              grid="dashed"
              height={narrow ? 'min(50dvh, 25rem)' : 'clamp(280px, 52vh, 420px)'}
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
          </div>
        ) : (
          <p role="status">Загружаем оригинал фото…</p>
        )}
        {!narrow && cropUrl && naturalSize ? (
          <div className={styles.cropPreviewPane}>
            <Panel title="Предпросмотр" headingLevel={3}>
              <div className={styles.cropPreviewContent}>
                <div
                  className={styles.cropPreviewImage}
                  style={{
                    aspectRatio: String(CROP_RATIOS[model.ratio] ?? naturalSize.width / naturalSize.height)
                  }}
                >
                  <canvas ref={previewCanvas} aria-hidden="true" />
                </div>
                <Switch
                  isSelected={cover}
                  isDisabled={cropBusy || busy || disabled}
                  onChange={(selected) => void setAsCover(selected)}
                >
                  Использовать как обложку
                </Switch>
                <p className={styles.cropPreviewHint}>Это фото будет отображаться в предпросмотре поста.</p>
                <p className={styles.cropPreviewHint}>
                  Фото станет первым в посте. Telegram не задаёт отдельную обложку.
                </p>
              </div>
            </Panel>
          </div>
        ) : null}
      </div>
      <RatioTileGroup
        label="Соотношение сторон"
        value={model.ratio}
        options={cropRatios.map((option) => ({
          ...option,
          label: narrow && option.id === 'original' ? 'Ориг.' : option.label
        }))}
        onChange={(value) => setRatio(value as CropRatio)}
      />
      <div className={styles.cropControlRow}>
        <Slider
          label="Масштаб"
          value={model.zoom}
          onChange={(zoom) => setModel((current) => ({ ...current, zoom, frame: clampCropFrame(current.frame, zoom) }))}
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
        <div className={styles.cropRotate}>
          <div className={styles.cropRotateHeading}>
            <span>Повернуть</span>
            {!narrow ? <span aria-live="polite">{model.rotation}°</span> : null}
            {narrow ? (
              <Button variant="ghost" size="sm" onPress={reset}>
                Сбросить
              </Button>
            ) : null}
          </div>
          <div className={styles.cropRotateButtons}>
            <IconButton
              label="Повернуть влево"
              icon="rotate-left"
              variant="secondary"
              size="target"
              isDisabled={cropBusy}
              onPress={() => rotate(-90)}
            />
            <IconButton
              label="Повернуть вправо"
              icon="rotate-right"
              variant="secondary"
              size="target"
              isDisabled={cropBusy}
              onPress={() => rotate(90)}
            />
          </div>
        </div>
      </div>
      {narrow ? (
        <div className={styles.cropCover}>
          <Switch
            variant="row"
            isSelected={cover}
            isDisabled={cropBusy || busy || disabled}
            onChange={(selected) => void setAsCover(selected)}
            leading={cropUrl ? <img className={styles.cropCoverThumb} src={cropUrl} alt="" /> : undefined}
            description="Эта фотография будет показываться в превью публикации."
          >
            Использовать как обложку
          </Switch>
          <p>Фото станет первым в посте. Telegram не задаёт отдельную обложку.</p>
        </div>
      ) : null}
    </Dialog>
  );
}
