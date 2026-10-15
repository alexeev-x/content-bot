import type { DotaHeroDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useMediaOriginal } from '../../../shared/lib/use-media-thumbnail';
import { EmptyState, ErrorState, LoadingImage, MediaSkeleton, Panel, Skeleton } from '../../../shared/ui';
import { getHeroAssetContent } from '../api/hero-assets-api';
import { heroAssetsQueryOptions } from '../api/hero-assets-queries';
import { copy } from './copy';
import { HeroFilesDialog } from './HeroFilesDialog';
import styles from './HeroGallery.module.css';

/** Настройки → Герои Dota: progress of the mirror and every hero, each opening its files. */
export function HeroGallery() {
  const list = useQuery(heroAssetsQueryOptions());
  const [open, setOpen] = useState<DotaHeroDto | null>(null);
  if (list.isError && list.data === undefined)
    return <ErrorState message={copy.loadError} onRetry={() => void list.refetch()} />;
  if (list.data === undefined) return <Skeleton />;
  const data = list.data;
  if (data.total === 0) return <EmptyState title={copy.emptyTitle} description={copy.emptyText} />;
  const finished = data.stored + data.missing >= data.total;
  return (
    <>
      <Panel>
        <div className={styles.summary}>
          <p className={styles.intro}>{copy.intro}</p>
          <output className={styles.progress}>
            <strong>{copy.progress(data.stored, data.total)}</strong>
            {data.missing > 0 ? <span>{copy.missing(data.missing)}</span> : null}
            {data.failed > 0 ? <span>{copy.failed(data.failed)}</span> : null}
          </output>
          <progress className={styles.bar} value={data.stored} max={data.total} aria-hidden="true" />
          <p className={styles.note}>{finished ? copy.done : copy.running}</p>
        </div>
      </Panel>
      <ul className={styles.grid} aria-label={copy.gridLabel}>
        {data.heroes.map((hero) => (
          <li key={hero.slug}>
            <HeroTile hero={hero} onOpen={() => setOpen(hero)} />
          </li>
        ))}
      </ul>
      <HeroFilesDialog hero={open} onClose={() => setOpen(null)} />
    </>
  );
}

/** The portrait loads once the tile scrolls near the screen. */
function HeroTile({ hero, onOpen }: { hero: DotaHeroDto; onOpen: () => void }) {
  const host = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  const stored = hero.assets.find((asset) => asset.kind === 'portrait')?.status === 'stored';
  const portrait = useMediaOriginal(
    `hero:${hero.slug}:portrait`,
    (signal) => getHeroAssetContent(hero.slug, 'portrait', signal),
    visible && stored
  );
  const ready = hero.assets.filter((asset) => asset.status === 'stored').length;

  useEffect(() => {
    if (visible || !host.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <button ref={host} type="button" className={styles.tile} onClick={onOpen} aria-label={copy.open(hero.name)}>
      <span className={styles.portrait}>
        {portrait.src ? <LoadingImage src={portrait.src} alt="" /> : stored ? <MediaSkeleton /> : null}
      </span>
      <span className={styles.name}>{hero.name}</span>
      <span className={styles.count}>
        {ready}/{hero.assets.length}
      </span>
    </button>
  );
}
