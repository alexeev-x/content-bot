/* oxlint-disable jsx-a11y/media-has-caption -- Valve's hero renders are silent animations without captions. */
import type { DotaHeroDto, HeroAssetKind } from '@alexeev/contracts';
import { useState } from 'react';
import { useMediaOriginal } from '../../../shared/lib/use-media-thumbnail';
import { Button, Dialog, LoadingImage, MediaSkeleton } from '../../../shared/ui';
import { getHeroAssetContent } from '../api/hero-assets-api';
import { copy } from './copy';
import styles from './HeroGallery.module.css';

const EXTENSION: Record<HeroAssetKind, string> = {
  render_webm: 'webm',
  render_mov: 'mov',
  render_png: 'png',
  portrait: 'png',
  icon: 'png',
  crop: 'png'
};

/** Plays in this browser? WebM with alpha in Chrome/Android/Telegram, MOV (HEVC alpha) in Safari. */
function playable(kind: HeroAssetKind): boolean {
  if (typeof document === 'undefined') return false;
  const probe = document.createElement('video');
  if (kind === 'render_webm') return probe.canPlayType('video/webm; codecs="vp9"') !== '';
  if (kind === 'render_mov') return probe.canPlayType('video/quicktime') !== '';
  return true;
}

async function download(slug: string, kind: HeroAssetKind): Promise<void> {
  const blob = await getHeroAssetContent(slug, kind);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${slug}-${kind}.${EXTENSION[kind]}`;
  link.click();
  // After the click has handed the file to the browser.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type Props = { hero: DotaHeroDto | null; onClose: () => void };

/** Every file of one hero over a checkerboard (it shows the transparency), each with a download button. */
export function HeroFilesDialog({ hero, onClose }: Props) {
  return (
    <Dialog
      isOpen={hero !== null}
      onOpenChange={(isOpen) => (isOpen ? undefined : onClose())}
      title={hero?.name ?? ''}
      description={copy.transparentHint}
      size="media"
    >
      {hero === null ? null : (
        <ul className={styles.files}>
          {hero.assets.map((asset) => (
            <li key={asset.kind} className={styles.file}>
              <span className={styles.fileTitle}>{copy.kind[asset.kind]}</span>
              {asset.status === 'stored' ? (
                <StoredFile slug={hero.slug} kind={asset.kind} size={asset.size} />
              ) : (
                <p className={styles.note}>{asset.status === 'missing' ? copy.notAtValve : copy.notStored}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

function StoredFile({ slug, kind, size }: { slug: string; kind: HeroAssetKind; size: number | null }) {
  const preview = playable(kind);
  const file = useMediaOriginal(`hero:${slug}:${kind}`, (signal) => getHeroAssetContent(slug, kind, signal), preview);
  const [downloading, setDownloading] = useState(false);
  const [failed, setFailed] = useState(false);
  const video = kind === 'render_webm' || kind === 'render_mov';
  return (
    <>
      {preview ? (
        <span className={styles.checker}>
          {file.isError ? (
            <span className={styles.note}>{copy.fileError}</span>
          ) : !file.src ? (
            <MediaSkeleton />
          ) : video ? (
            <video src={file.src} autoPlay loop muted playsInline className={styles.media} />
          ) : (
            <LoadingImage src={file.src} alt="" className={styles.media} />
          )}
        </span>
      ) : null}
      <span className={styles.fileActions}>
        {size === null ? null : <span className={styles.note}>{(size / 1024 / 1024).toFixed(1)} МБ</span>}
        <Button
          variant="secondary"
          icon="download"
          isLoading={downloading}
          onPress={() => {
            setDownloading(true);
            setFailed(false);
            download(slug, kind)
              .catch(() => setFailed(true))
              .finally(() => setDownloading(false));
          }}
        >
          {copy.download}
        </Button>
        {failed ? <span className={styles.note}>{copy.fileError}</span> : null}
      </span>
    </>
  );
}
