/* oxlint-disable jsx-a11y/media-has-caption -- Valve's hero renders are silent animations without captions. */
import type { DotaHeroDto, HeroAssetKind } from '@alexeev/contracts';
import { useState } from 'react';
import { useMediaOriginal } from '../../../shared/lib/use-media-thumbnail';
import { Button, Dialog, Disclosure, DisclosureGroup, LoadingImage, MediaSkeleton } from '../../../shared/ui';
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

/**
 * Every file of one hero as a collapsed row; opening a row loads and shows that file over a checkerboard (it
 * shows the transparency), with a download button.
 */
export function HeroFilesDialog({ hero, onClose }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  return (
    <Dialog
      isOpen={hero !== null}
      onOpenChange={(isOpen) => {
        if (isOpen) return;
        setExpanded(new Set());
        onClose();
      }}
      title={hero?.name ?? ''}
      description={copy.transparentHint}
      size="media"
    >
      {hero === null ? null : (
        <>
          <IconRow hero={hero} />
          <DisclosureGroup expandedKeys={expanded} onExpandedChange={setExpanded}>
            {hero.assets
              .filter((asset) => asset.kind !== 'icon')
              .map((asset) => (
                <Disclosure
                  key={asset.kind}
                  id={asset.kind}
                  title={copy.kind[asset.kind]}
                  aside={<span className={styles.note}>{asideText(asset)}</span>}
                >
                  {asset.status === 'stored' ? (
                    <StoredFile slug={hero.slug} kind={asset.kind} active={expanded.has(asset.kind)} />
                  ) : (
                    <p className={styles.note}>
                      {asset.status === 'missing'
                        ? copy.notAtValve
                        : asset.status === 'failed'
                          ? copy.failedWith(asset.errorCode ?? '—')
                          : copy.notStored}
                    </p>
                  )}
                </Disclosure>
              ))}
          </DisclosureGroup>
        </>
      )}
    </Dialog>
  );
}

/** The icon is tiny, so it is always shown, at its own size, without a row to open. */
function IconRow({ hero }: { hero: DotaHeroDto }) {
  const asset = hero.assets.find((candidate) => candidate.kind === 'icon');
  const stored = asset?.status === 'stored';
  const file = useMediaOriginal(
    `hero:${hero.slug}:icon`,
    (signal) => getHeroAssetContent(hero.slug, 'icon', signal),
    stored
  );
  if (asset === undefined) return null;
  return (
    <div className={styles.iconRow}>
      <span className={styles.fileTitle}>{copy.kind.icon}</span>
      <span className={styles.iconEnd}>
        {stored ? (
          file.src ? (
            <img src={file.src} alt="" className={styles.icon} />
          ) : null
        ) : (
          <span className={styles.note}>{asideText(asset)}</span>
        )}
        {stored ? <DownloadButton slug={hero.slug} kind="icon" /> : null}
      </span>
    </div>
  );
}

/** The collapsed row's summary: the size of a stored file, or why there is none. */
function asideText(asset: DotaHeroDto['assets'][number]): string {
  if (asset.status === 'stored') return asset.size === null ? '' : `${(asset.size / 1024 / 1024).toFixed(1)} МБ`;
  const code = asset.errorCode === null ? '' : ` (${asset.errorCode})`;
  return asset.status === 'missing'
    ? `${copy.asideMissing}${code}`
    : asset.status === 'failed'
      ? `${copy.asideFailed}${code}`
      : copy.asidePending;
}

/** Loads the file only while its row is open. */
function StoredFile({ slug, kind, active }: { slug: string; kind: HeroAssetKind; active: boolean }) {
  const preview = playable(kind);
  const file = useMediaOriginal(
    `hero:${slug}:${kind}`,
    (signal) => getHeroAssetContent(slug, kind, signal),
    preview && active
  );
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
        <DownloadButton slug={slug} kind={kind} />
      </span>
    </>
  );
}

function DownloadButton({ slug, kind }: { slug: string; kind: HeroAssetKind }) {
  const [downloading, setDownloading] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <>
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
    </>
  );
}
