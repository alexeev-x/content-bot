import { MediaCropDialog, useMediaQuery } from '../../../shared/ui';
import type { useLibraryCrop } from '../model/use-library-crop';

/** «Кадрировать» in the library detail view: the shared crop dialog saving a new file. */
export function LibraryCropDialog({ crop }: { crop: ReturnType<typeof useLibraryCrop> }) {
  const narrow = useMediaQuery('(max-width: 859px)');
  const kind = crop.source?.kind ?? 'photo';
  return (
    <MediaCropDialog
      isOpen={crop.source !== null}
      kind={kind}
      narrow={narrow}
      src={crop.url}
      naturalSize={crop.naturalSize}
      model={crop.model}
      onModelChange={crop.setModel}
      onRatioChange={crop.setRatio}
      onRotate={crop.rotate}
      onReset={crop.reset}
      previewCanvas={kind === 'photo' ? crop.previewCanvas : undefined}
      busy={crop.busy}
      canSave={Boolean(crop.url) && crop.naturalSize !== null}
      error={crop.error}
      onSave={crop.save}
      onClose={crop.close}
      onCancelProcessing={crop.cancelProcessing}
      progress={crop.progress}
      trim={crop.trim}
      loadingLabel={kind === 'photo' ? 'Загружаем оригинал фото…' : 'Загружаем оригинал видео…'}
    />
  );
}
