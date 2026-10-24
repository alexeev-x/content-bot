import { MediaCropDialog, Switch } from '../../../shared/ui';
import type { MediaCrop } from '../model/use-media-crop';
import styles from './PostMediaEditor.module.css';

type Props = {
  crop: MediaCrop;
  narrow: boolean;
  busy: boolean;
  disabled: boolean;
};

/** The editor's crop dialog: the shared dialog plus the «use as cover» switch for photos. */
export function CropDialog({ crop, narrow, busy, disabled }: Props) {
  const { media, url, cropBusy, cover, setAsCover } = crop;
  const isPhoto = media?.kind === 'photo';
  const coverDisabled = cropBusy || busy || disabled;
  return (
    <MediaCropDialog
      isOpen={media !== null}
      kind={media?.kind === 'video' ? 'video' : 'photo'}
      narrow={narrow}
      src={url}
      naturalSize={crop.naturalSize}
      model={crop.model}
      onModelChange={crop.setModel}
      onRatioChange={crop.setRatio}
      onRotate={crop.rotate}
      onReset={crop.reset}
      previewCanvas={isPhoto ? crop.previewCanvas : undefined}
      busy={cropBusy}
      canSave={Boolean(url) && !disabled && !busy && crop.naturalSize !== null}
      error={crop.error}
      onSave={() => void crop.apply()}
      onClose={crop.close}
      onCancelProcessing={crop.cancelProcessing}
      progress={crop.progress}
      trim={crop.trim}
      loadingLabel={isPhoto ? 'Загружаем оригинал фото…' : 'Загружаем оригинал видео…'}
      aside={
        isPhoto ? (
          <>
            <Switch isSelected={cover} isDisabled={coverDisabled} onChange={(selected) => void setAsCover(selected)}>
              Использовать как обложку
            </Switch>
            <p className={styles.cropPreviewHint}>Это фото будет отображаться в предпросмотре поста.</p>
            <p className={styles.cropPreviewHint}>Фото станет первым в посте. Telegram не задаёт отдельную обложку.</p>
          </>
        ) : null
      }
      mobileExtra={
        isPhoto ? (
          <div className={styles.cropCover}>
            <Switch
              variant="row"
              isSelected={cover}
              isDisabled={coverDisabled}
              onChange={(selected) => void setAsCover(selected)}
              leading={url ? <img className={styles.cropCoverThumb} src={url} alt="" /> : undefined}
              description="Эта фотография будет показываться в превью публикации."
            >
              Использовать как обложку
            </Switch>
            <p>Фото станет первым в посте. Telegram не задаёт отдельную обложку.</p>
          </div>
        ) : null
      }
    />
  );
}
