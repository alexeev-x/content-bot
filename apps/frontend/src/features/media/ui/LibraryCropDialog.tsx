import { useState } from 'react';
import { MediaCropDialog, useMediaQuery } from '../../../shared/ui';
import type { useLibraryCrop } from '../model/use-library-crop';
import { SaveModeDialog } from './SaveModeDialog';

/** «Кадрировать» in the library detail view: the shared crop dialog; «Сохранить» first asks new file or replace. */
export function LibraryCropDialog({ crop }: { crop: ReturnType<typeof useLibraryCrop> }) {
  const narrow = useMediaQuery('(max-width: 859px)');
  const [asking, setAsking] = useState(false);
  const kind = crop.source?.kind ?? 'photo';
  return (
    <>
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
        onSave={() => setAsking(true)}
        onClose={crop.close}
        onCancelProcessing={crop.cancelProcessing}
        progress={crop.progress}
        trim={crop.trim}
        loadingLabel={kind === 'photo' ? 'Загружаем оригинал фото…' : 'Загружаем оригинал видео…'}
      />
      <SaveModeDialog
        isOpen={asking && crop.source !== null}
        fileName={crop.source?.fileName ?? ''}
        onClose={() => setAsking(false)}
        onChoose={(mode) => {
          setAsking(false);
          crop.save(mode);
        }}
      />
    </>
  );
}
