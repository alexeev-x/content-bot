/* oxlint-disable jsx-a11y/media-has-caption -- Uploaded files may not contain captions; never fabricate a track. */
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Live status is kept on the existing generic containers for layout and semantics. */
import { POST_MEDIA_MAX_ITEMS, type PostMediaDto } from '@alexeev/contracts';
import { Button, LoadingImage, MediaAddTile } from '../../../shared/ui';
import type { Entry } from '../model/media-entry';
import { replaceAtLimitNotice } from '../model/media-entry';
import type { MediaReorder } from '../model/use-media-reorder';
import { ServerPreview } from './ServerPreview';
import styles from './PostMediaEditor.module.css';

type Props = {
  entries: Entry[];
  postId: string | null;
  narrow: boolean;
  busy: boolean;
  disabled: boolean;
  reorder: MediaReorder;
  onAdd: () => void;
  onOpen: (media: PostMediaDto) => void;
  onRemove: (entry: Entry) => void;
  onUpload: (entry: Entry) => void;
};

/** The attachment tiles: server-confirmed ones can be reordered, local ones show their upload state. */
export function MediaList({
  entries,
  postId,
  narrow,
  busy,
  disabled,
  reorder,
  onAdd,
  onOpen,
  onRemove,
  onUpload
}: Props) {
  const addTile =
    entries.length < POST_MEDIA_MAX_ITEMS ? (
      <li className={styles.addItem}>
        <MediaAddTile label="Добавить файлы" fluid isDisabled={disabled || busy} onPress={onAdd} />
      </li>
    ) : null;
  const uploadedEntries = entries.filter((item) => item.media);
  return (
    <>
      <ol className={styles.list} aria-label="Вложения поста">
        {!narrow ? addTile : null}
        {entries.map((entry) => {
          const uploadedIndex = uploadedEntries.findIndex((item) => item.key === entry.key);
          const mediaItem = entry.media;
          return (
            /* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Native draggable list item also supports the handoff's keyboard lift/move/drop model. */
            <li
              className={styles.item}
              key={entry.key}
              data-pending={!mediaItem || undefined}
              aria-label={mediaItem ? `${mediaItem.fileName}, позиция ${uploadedIndex + 1}` : undefined}
              data-drop-target={reorder.keyboardTargetKey === entry.key || undefined}
              draggable={Boolean(postId && entry.status === 'uploaded' && !disabled)}
              onKeyDown={(event) => reorder.handleReorderKeyDown(event, entry)}
              onDragStart={() => reorder.startDrag(entry.key)}
              onDragEnd={reorder.endDrag}
              onDragOver={(event) => {
                if (reorder.draggedKey && reorder.draggedKey !== entry.key) event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                const source = entries.find((item) => item.key === reorder.draggedKey);
                if (source) void reorder.moveBefore(source, entry);
              }}
            >
              {entry.previewUrl ? (
                entry.file?.type.startsWith('video/') ? (
                  <video className={styles.preview} src={entry.previewUrl} controls preload="metadata" />
                ) : (
                  <LoadingImage
                    className={styles.preview}
                    src={entry.previewUrl}
                    alt={`Предпросмотр: ${entry.file?.name ?? 'файл'}`}
                  />
                )
              ) : entry.media ? (
                <ServerPreview
                  media={entry.media}
                  gridTile
                  fluid
                  onOpen={() => mediaItem && onOpen(mediaItem)}
                  onRemove={() => onRemove(entry)}
                  isDisabled={busy || disabled}
                  handle={
                    postId && entry.status === 'uploaded' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon="grip"
                        aria-label={`Переставить ${entry.media.fileName}`}
                        aria-keyshortcuts="Space ArrowUp ArrowDown Escape"
                        isDisabled={disabled || busy}
                        onPress={() => reorder.handleReorderPress(entry)}
                      />
                    ) : undefined
                  }
                />
              ) : null}
              <div className={`${styles.details} ${mediaItem && !entry.actionError ? styles.tileDetails : ''}`}>
                <strong>{entry.file?.name ?? entry.media?.fileName}</strong>
                <span>
                  {entry.media?.kind === 'video' || entry.file?.type.startsWith('video/')
                    ? 'Видео'
                    : entry.media?.kind === 'animation' || entry.file?.type === 'image/gif'
                      ? 'GIF'
                      : 'Фото'}
                  {' · '}
                  {((entry.file?.size ?? entry.media?.sizeBytes ?? 0) / 1_000_000).toFixed(1)} МБ
                  {entry.media?.durationMs ? ` · ${Math.round(entry.media.durationMs / 1000)} с` : ''}
                </span>
                {entry.status === 'local' ? <span>{entry.error ?? 'Выбрано · ещё не загружено'}</span> : null}
                {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- This status is intentionally a concise live announcement. */}
                {entry.actionError ? (
                  <span className={styles.error} role="alert">
                    {entry.actionError}
                  </span>
                ) : null}
                {entry.actionError ? (
                  <Button variant="secondary" size="sm" isDisabled={disabled || busy} onPress={() => onRemove(entry)}>
                    Повторить удаление
                  </Button>
                ) : null}
                {entry.status === 'uploading' ? <span role="status">Загрузка: {entry.progress ?? 0}%</span> : null}
                {entry.status === 'failed' ? <span className={styles.error}>{entry.error}</span> : null}
                {entry.status === 'uploaded' ? <span>Загружено на сервер</span> : null}
                {entry.status === 'uploading' ? (
                  <progress aria-label={`Загрузка ${entry.file?.name ?? ''}`} max={100} value={entry.progress ?? 0} />
                ) : null}
                {entry.status === 'failed' ? (
                  <Button variant="secondary" size="sm" onPress={() => onUpload(entry)}>
                    Повторить
                  </Button>
                ) : null}
                {entry.status === 'local' ? (
                  <Button variant="secondary" size="sm" onPress={() => onUpload(entry)}>
                    Загрузить
                  </Button>
                ) : null}
              </div>
              {!mediaItem ? (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Убрать ${entry.file?.name ?? 'файл'}`}
                  isDisabled={busy || disabled}
                  onPress={() => onRemove(entry)}
                >
                  Убрать
                </Button>
              ) : null}
            </li>
          );
        })}
        {narrow ? addTile : null}
      </ol>
      <span className={styles.srOnly} role="status" aria-live="polite">
        {reorder.announcement}
      </span>
      {entries.length >= POST_MEDIA_MAX_ITEMS ? <p className={styles.hint}>{replaceAtLimitNotice}</p> : null}
    </>
  );
}
