/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Live status is kept on the existing generic containers for layout and semantics. */
import { POST_MEDIA_MAX_ITEMS } from '@alexeev/contracts';
import { useEffect, useRef, useState } from 'react';
import { useMediaThumbnail } from '../../../shared/lib/use-media-thumbnail';
import { Button, MediaGridTile, Select } from '../../../shared/ui';
import { getPostMediaContent } from '../api/post-media-api';
import { formatMediaDuration, type Entry } from '../model/media-entry';
import type { LibraryItem, MediaLibrary } from '../model/use-media-library';
import styles from './PostMediaEditor.module.css';

function LibraryTile({
  item,
  selected,
  disabled,
  onSelectedChange
}: {
  item: LibraryItem;
  selected: boolean;
  disabled: boolean;
  onSelectedChange: (selected: boolean) => void;
}) {
  const tileRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(() => !('IntersectionObserver' in window));
  const isVideo = item.kind === 'video';
  const thumbnail = useMediaThumbnail(
    item.id,
    isVideo ? 'video' : 'image',
    (signal) => getPostMediaContent(item.id, signal),
    isVisible
  );
  const src = thumbnail.src;
  useEffect(() => {
    if (!tileRef.current) return;
    if (!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '160px' }
    );
    observer.observe(tileRef.current);
    return () => observer.disconnect();
  }, []);
  const previewUnavailable = thumbnail.isError;
  return (
    <div ref={tileRef} className={styles.libraryTile}>
      <MediaGridTile
        label={item.fileName}
        src={src}
        kind={isVideo ? 'video' : 'image'}
        duration={isVideo ? formatMediaDuration(item.durationMs) : undefined}
        state={previewUnavailable ? 'failed' : 'ready'}
        stateLabel={previewUnavailable ? 'Превью недоступно' : undefined}
        onRetry={previewUnavailable ? thumbnail.retry : undefined}
        retryLabel={previewUnavailable ? 'Повторить загрузку превью' : undefined}
        selectable
        isSelected={selected}
        onSelectedChange={onSelectedChange}
        isDisabled={disabled}
      />
      <span title={item.fileName}>{item.fileName}</span>
    </div>
  );
}

type Props = {
  library: MediaLibrary;
  entries: Entry[];
  busy: boolean;
  disabled: boolean;
};

/** Library and «Недавние» tabs share one grid: pick files, then «Добавить в пост» attaches them. */
export function MediaLibraryPanel({ library, entries, busy, disabled }: Props) {
  const { kind, items, cursor, selection, libraryBusy, error, errorAction } = library;
  const tab = library.sourceTab === 'recent' ? 'recent' : 'library';
  return (
    <div className={styles.library}>
      <Select
        label="Тип файла"
        value={kind}
        options={[
          { id: 'all', label: 'Все' },
          { id: 'photo', label: 'Фото' },
          { id: 'video', label: 'Видео' }
        ]}
        onChange={(value) => {
          if (value === 'all' || value === 'photo' || value === 'video') {
            library.resetListing();
            void library.openLibrary(value, undefined, tab);
          }
        }}
      />
      {error ? (
        <div>
          <p className={styles.error} role="alert">
            {error}
          </p>
          {errorAction ? (
            <Button
              variant="secondary"
              isDisabled={libraryBusy || disabled}
              onPress={() =>
                errorAction === 'attach'
                  ? void library.attachSelected()
                  : void library.openLibrary(kind, undefined, tab)
              }
            >
              Повторить
            </Button>
          ) : null}
        </div>
      ) : null}
      {libraryBusy && items.length === 0 ? <p role="status">Загружаем медиабиблиотеку…</p> : null}
      {!libraryBusy && items.length === 0 && !error ? <p>Здесь пока нет файлов.</p> : null}
      <ul className={styles.libraryGrid} aria-busy={libraryBusy} aria-label="Файлы медиабиблиотеки">
        {libraryBusy && items.length === 0
          ? Array.from({ length: 6 }, (_, index) => (
              <li key={`skeleton-${index}`} className={styles.librarySkeleton} aria-hidden="true" />
            ))
          : null}
        {items.map((item) => {
          const selected = selection.includes(item.id);
          const alreadyAttached = entries.some((entry) => entry.media?.id === item.id);
          const atLimit = entries.length + selection.length >= POST_MEDIA_MAX_ITEMS;
          return (
            <li key={item.id}>
              <LibraryTile
                item={item}
                selected={selected}
                disabled={busy || libraryBusy || disabled || alreadyAttached || (atLimit && !selected)}
                onSelectedChange={(nextSelected) =>
                  library.setSelection((current) =>
                    nextSelected ? [...current, item.id] : current.filter((id) => id !== item.id)
                  )
                }
              />
            </li>
          );
        })}
      </ul>
      {cursor ? (
        <Button variant="secondary" isLoading={libraryBusy} onPress={() => void library.openLibrary(kind, cursor)}>
          Показать ещё
        </Button>
      ) : null}
    </div>
  );
}
