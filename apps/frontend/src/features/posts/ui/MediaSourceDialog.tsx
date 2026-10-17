import type { RefObject } from 'react';
import { ActionRow, BottomSheet, Button, Dialog, Dropzone, Tab, TabList, TabPanel, Tabs } from '../../../shared/ui';
import { ACCEPTED_TYPES, type Entry } from '../model/media-entry';
import type { MediaLibrary } from '../model/use-media-library';
import { MediaLibraryPanel } from './MediaLibraryPanel';
import styles from './PostMediaEditor.module.css';

type Props = {
  library: MediaLibrary;
  narrow: boolean;
  busy: boolean;
  disabled: boolean;
  entries: Entry[];
  notice: string;
  onFiles: (files: FileList | File[] | null) => void;
  inputRef: RefObject<HTMLInputElement | null>;
  cameraInputRef: RefObject<HTMLInputElement | null>;
};

/** Where media comes from: the device (uploads start as soon as files are chosen) or the saved library. */
export function MediaSourceDialog({
  library,
  narrow,
  busy,
  disabled,
  entries,
  notice,
  onFiles,
  inputRef,
  cameraInputRef
}: Props) {
  const { sourceOpen, sourceTab, selection } = library;
  const panel = <MediaLibraryPanel library={library} entries={entries} busy={busy} disabled={disabled} />;
  const footer = (
    <>
      <Button variant="secondary" onPress={library.closeSource}>
        Отмена
      </Button>
      {sourceTab !== 'device' ? (
        <Button
          variant="primary"
          isLoading={library.libraryBusy}
          isDisabled={selection.length === 0 || disabled}
          onPress={() => void library.attachSelected()}
        >
          Добавить в пост{selection.length > 0 ? ` (${selection.length})` : ''}
        </Button>
      ) : null}
    </>
  );
  const onOpenChange = (open: boolean) => (open ? library.openSource() : library.closeSource());

  return (
    <>
      <Dialog
        isOpen={sourceOpen && !narrow}
        onOpenChange={onOpenChange}
        title="Добавление медиа"
        description="Выберите файлы с устройства или из сохранённых медиа."
        size="media"
        footer={footer}
      >
        <span className={styles.sourceDialogMarker} aria-hidden="true" />
        <Tabs
          variant="card"
          selectedKey={sourceTab}
          onSelectionChange={(key) => {
            if (key === 'device') library.setSourceTab('device');
            if (key === 'library') {
              library.setSourceTab('library');
              // Always re-read: a file uploaded since the last look must be there (the cached page is invalidated).
              if (library.kind !== 'all') library.resetListing();
              void library.openLibrary('all');
            }
          }}
        >
          <TabList aria-label="Источник медиа">
            <Tab id="device" icon="laptop" hint="Загрузите файлы с устройства">
              С компьютера
            </Tab>
            <Tab id="library" icon="folder" hint="Ваши сохранённые файлы">
              Медиабиблиотека
            </Tab>
          </TabList>
          <TabPanel id="device">
            <div className={styles.deviceSource}>
              <Dropzone
                title="Перетащите фото и видео сюда"
                subtitle="или выберите файлы на устройстве"
                dropLabel="Отпустите файлы"
                actionLabel="Выбрать файлы"
                actionIcon="upload"
                actionSize="lg"
                size="lg"
                accept={ACCEPTED_TYPES}
                onFiles={onFiles}
                isDisabled={busy || disabled}
              >
                Фото — JPG, PNG, WebP до 10 МБ; GIF и видео MP4 — до 50 МБ. В посте до 10 файлов.
              </Dropzone>
            </div>
          </TabPanel>
          <TabPanel id="library">{panel}</TabPanel>
        </Tabs>
        {notice ? (
          <p className={styles.error} role="alert">
            {notice}
          </p>
        ) : null}
        {selection.length > 0 && sourceTab !== 'device' ? (
          <p className={styles.hint}>Выбрано файлов: {selection.length}</p>
        ) : null}
      </Dialog>
      <BottomSheet
        isOpen={sourceOpen && narrow}
        onOpenChange={onOpenChange}
        title="Добавить фото и видео"
        footer={<div className={styles.mobileFooter}>{footer}</div>}
      >
        {sourceTab === 'device' ? (
          <div className={styles.mobileSource}>
            <ActionRow
              icon="camera"
              title="Снять фото"
              hint="Откроется камера устройства"
              onPress={() => cameraInputRef.current?.click()}
              isDisabled={busy || disabled}
            />
            <ActionRow
              icon="image"
              title="Выбрать из галереи"
              hint="Фото и видео с устройства"
              onPress={() => inputRef.current?.click()}
              isDisabled={busy || disabled}
            />
            <ActionRow
              icon="folder"
              title="Открыть медиабиблиотеку"
              hint="Ваши сохранённые файлы"
              onPress={() => void library.openLibrary('all')}
              isDisabled={busy || disabled}
            />
          </div>
        ) : (
          <div className={styles.mobileSource}>
            <Button variant="secondary" onPress={() => library.setSourceTab('device')}>
              Назад к источникам
            </Button>
            {panel}
          </div>
        )}
      </BottomSheet>
    </>
  );
}
