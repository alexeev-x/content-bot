import type { PostMediaDto } from '@alexeev/contracts';
import { useRef, useState } from 'react';
import { Button, Icon, useMediaQuery } from '../../../shared/ui';
import { ACCEPTED_TYPES } from '../model/media-entry';
import { useMediaCrop } from '../model/use-media-crop';
import { useMediaLibrary } from '../model/use-media-library';
import { useMediaReorder } from '../model/use-media-reorder';
import { useMediaState, type MediaEditorProps } from '../model/use-media-state';
import { useMediaUpload } from '../model/use-media-upload';
import { CropDialog } from './CropDialog';
import { MediaExpandedDialog } from './MediaExpandedDialog';
import { MediaList } from './MediaList';
import { MediaSourceDialog } from './MediaSourceDialog';
import styles from './PostMediaEditor.module.css';

/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Live status is kept on the existing generic containers for layout and semantics. */

const ACCEPT = ACCEPTED_TYPES.join(',');

/** The «Фото и видео» section of the editor: wires the media hooks to the list and its dialogs. */
export function PostMediaEditor(props: MediaEditorProps) {
  const { postId, disabled } = props;
  const narrow = useMediaQuery('(max-width: 859px)');
  const state = useMediaState(props);
  const { entries, busy, notice, pending } = state;
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [mobileMediaCollapsed, setMobileMediaCollapsed] = useState(false);
  const [expandedMedia, setExpandedMedia] = useState<PostMediaDto | null>(null);
  const library = useMediaLibrary(state);
  const upload = useMediaUpload(state, { inputRef, closeSource: library.closeSource });
  const reorder = useMediaReorder(state);
  const crop = useMediaCrop(state);
  const count = entries.length;

  return (
    <>
      <section
        className={`${styles.section} ${upload.isDropTarget ? styles.dropTarget : ''}`}
        data-collapsed={narrow && mobileMediaCollapsed ? '' : undefined}
        aria-labelledby="post-media-heading"
        /* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Drag-and-drop is an optional desktop enhancement; the file-picker button is the keyboard alternative. */
        {...upload.fileDropHandlers}
      >
        <div className={styles.heading}>
          <div className={styles.headingCopy}>
            <h2 id="post-media-heading">
              <Icon name="image" size={20} />
              Фото и видео
              {count > 0 ? (
                <span className={styles.mediaCount}>
                  {' '}
                  ({count} {count === 1 ? 'файл' : 'файлов'})
                </span>
              ) : null}
            </h2>
          </div>
          <button
            type="button"
            className={styles.mobileCollapse}
            aria-label={mobileMediaCollapsed ? 'Развернуть раздел Фото и видео' : 'Свернуть раздел Фото и видео'}
            aria-expanded={!mobileMediaCollapsed}
            aria-controls="post-media-content"
            onClick={() => setMobileMediaCollapsed((collapsed) => !collapsed)}
          >
            <Icon name={mobileMediaCollapsed ? 'chevron-down' : 'chevron-up'} size={20} />
          </button>
          <input
            ref={inputRef}
            className={styles.fileInput}
            type="file"
            accept={ACCEPT}
            multiple
            aria-hidden="true"
            tabIndex={-1}
            data-testid="media-file-input"
            onChange={(event) => {
              const replaceId = event.currentTarget.dataset.replaceId || undefined;
              delete event.currentTarget.dataset.replaceId;
              void upload.selectFiles(event.currentTarget.files, replaceId);
            }}
          />
          <input
            ref={cameraInputRef}
            className={styles.fileInput}
            type="file"
            accept={ACCEPT}
            capture="environment"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(event) => void upload.selectFiles(event.currentTarget.files)}
          />
        </div>
        <div id="post-media-content" className={styles.mediaContent}>
          {count > 0 ? (
            <MediaList
              entries={entries}
              postId={postId}
              narrow={narrow}
              busy={busy}
              disabled={disabled}
              reorder={reorder}
              onAdd={library.openSource}
              onOpen={setExpandedMedia}
              onRemove={(entry) => void upload.remove(entry)}
              onUpload={(entry) => void upload.upload(entry)}
            />
          ) : (
            <div className={styles.emptyDropzone} data-active={upload.isDropTarget || undefined}>
              <span className={styles.emptyDropzoneIcon} aria-hidden="true">
                <Icon name="image-plus" size={28} />
              </span>
              <span className={styles.emptyDropzoneText}>
                <strong>{upload.isDropTarget ? 'Отпустите файлы, чтобы добавить' : 'Добавьте фото или видео'}</strong>
                <span>Перетащите файлы сюда, вставьте из буфера или выберите из медиатеки</span>
              </span>
              <Button
                variant="secondary"
                size="sm"
                icon="plus"
                isDisabled={disabled || busy}
                onPress={library.openSource}
              >
                Добавить медиа
              </Button>
            </div>
          )}
          {upload.canCancel ? (
            <Button variant="ghost" size="sm" onPress={upload.cancelUpload}>
              Отменить загрузку
            </Button>
          ) : null}
          {notice ? (
            <p className={styles.error} role="alert">
              {notice}
            </p>
          ) : null}
          {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- The pending approval explanation is a live status. */}
          {pending ? (
            <p className={styles.hint} role="status">
              Завершите загрузку или уберите файл — до этого пост нельзя одобрить.
            </p>
          ) : null}
        </div>
      </section>
      <CropDialog crop={crop} narrow={narrow} busy={busy} disabled={disabled} />
      <MediaSourceDialog
        library={library}
        narrow={narrow}
        busy={busy}
        disabled={disabled}
        entries={entries}
        notice={notice}
        onFiles={(files) => void upload.selectFiles(files)}
        inputRef={inputRef}
        cameraInputRef={cameraInputRef}
      />
      <MediaExpandedDialog
        media={expandedMedia}
        onClose={() => setExpandedMedia(null)}
        onCrop={(item) => {
          setExpandedMedia(null);
          crop.open(item);
        }}
        inputRef={inputRef}
        entryCount={count}
        isDisabled={busy || disabled}
      />
    </>
  );
}
