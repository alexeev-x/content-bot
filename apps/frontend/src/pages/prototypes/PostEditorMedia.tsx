/* oxlint-disable react/refs, react/set-state-in-effect, react/exhaustive-effect-dependencies, react/capitalized-calls, jsx-a11y/prefer-tag-over-role, jsx-a11y/no-autofocus, jsx-a11y/no-noninteractive-element-interactions, unicorn/prefer-add-event-listener, eslint/no-shadow -- dev-only prototype: mock timers, live regions and a full-screen crop layer */
import { useEffect, useRef, useState } from 'react';
import {
  ActionRow,
  BottomSheet,
  Banner,
  Button,
  Dialog,
  Dropzone,
  MediaGridTile,
  Skeleton,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  UploadRow
} from '../../shared/ui';
import { LIBRARY, PHOTO_MAX_BYTES, POST_MEDIA_MAX_ITEMS, VIDEO_MAX_BYTES, type PostMedia } from './post-editor-data';
import styles from './PostEditorMedia.module.css';

export type QueueItem = {
  id: string;
  name: string;
  kind: 'image' | 'video';
  src?: string;
  meta: string;
  state: 'ready' | 'uploading' | 'failed';
  progress: number;
  label: string;
  /** Fixtures stay at their progress; picked files tick forward. */
  live: boolean;
};

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4'] as const;
const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1).replace('.', ',')} МБ`;

/** Maps a picked file to a queue row; unsupported or oversized files become error rows and never count. */
export function queueItemFor(file: File, id: string): QueueItem {
  const video = file.type === 'video/mp4';
  const kind = video ? 'video' : 'image';
  const base = { id, name: file.name, kind, meta: megabytes(file.size), progress: 0, live: false } as const;
  if (!(ACCEPT as readonly string[]).includes(file.type)) {
    const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : file.type;
    return { ...base, state: 'failed', label: `${ext} — формат не поддерживается` };
  }
  const limit = video || file.type === 'image/gif' ? VIDEO_MAX_BYTES : PHOTO_MAX_BYTES;
  if (file.size > limit) {
    return {
      ...base,
      state: 'failed',
      label: video || file.type === 'image/gif' ? 'файл больше 50 МБ' : 'фото больше 10 МБ'
    };
  }
  const src = kind === 'image' ? URL.createObjectURL(file) : undefined;
  return { ...base, ...(src ? { src } : {}), state: 'uploading', label: 'Загрузка…', live: true };
}

export const PREFILLED_QUEUE: QueueItem[] = [
  {
    id: 'q1',
    name: 'altai_lake.jpg',
    kind: 'image',
    src: LIBRARY[5]!.src,
    meta: '4.2 МБ • 4032 × 3024',
    state: 'ready',
    progress: 100,
    label: 'Готов к добавлению',
    live: false
  },
  {
    id: 'q2',
    name: 'sunrise_trekking.mp4',
    kind: 'video',
    src: LIBRARY[3]!.src,
    meta: '128.7 МБ • 1920 × 1080 • 01:24',
    state: 'uploading',
    progress: 62,
    label: 'Загрузка…',
    live: false
  }
];

/** Moves live uploads forward every 400 ms until they are ready (mock). */
export function useQueueTicker(setQueue: (update: (queue: QueueItem[]) => QueueItem[]) => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      setQueue((queue) =>
        queue.some((item) => item.live && item.state === 'uploading')
          ? queue.map((item) => {
              if (!item.live || item.state !== 'uploading') return item;
              const progress = Math.min(100, item.progress + 18);
              return progress >= 100
                ? { ...item, progress, state: 'ready', label: 'Готов к добавлению' }
                : { ...item, progress };
            })
          : queue
      );
    }, 400);
    return () => clearInterval(timer);
  }, [active, setQueue]);
}

type LibraryProps = {
  mode: 'library' | 'recent';
  selected: ReadonlySet<string>;
  onToggle: (id: string, on: boolean) => void;
  full: boolean;
};

function Library({ mode, selected, onToggle, full }: LibraryProps) {
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const failedOnce = useRef(false);
  useEffect(() => {
    setPhase('loading');
    const timer = setTimeout(() => {
      // «Недавние» fails once so the inline error and its retry can be seen.
      if (mode === 'recent' && !failedOnce.current) {
        failedOnce.current = true;
        setPhase('error');
      } else setPhase('ready');
    }, 700);
    return () => clearTimeout(timer);
  }, [mode, attempt]);
  const list = mode === 'recent' ? LIBRARY.slice(0, 20) : LIBRARY;
  if (phase === 'loading') {
    return (
      <div className={styles.libGrid} aria-busy="true" role="status" aria-label="Загрузка библиотеки">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} height="var(--size-media-tile)" radius="var(--radius-4)" />
        ))}
      </div>
    );
  }
  if (phase === 'error') {
    return (
      <Banner
        tone="error"
        title="Не удалось загрузить библиотеку"
        action={
          <Button size="sm" variant="secondary" onPress={() => setAttempt((v) => v + 1)}>
            Повторить
          </Button>
        }
      />
    );
  }
  return (
    <div className={styles.libGrid}>
      {list.map((item) => (
        <MediaGridTile
          key={item.id}
          fluid
          label={item.name}
          src={item.src}
          kind={item.kind}
          {...(item.duration ? { duration: item.duration } : {})}
          selectable
          isSelected={selected.has(item.id)}
          isDisabled={full && !selected.has(item.id)}
          onSelectedChange={(on) => onToggle(item.id, on)}
        />
      ))}
    </div>
  );
}

type DialogProps = {
  initialTab: 'pc' | 'library' | 'recent';
  queue: QueueItem[];
  setQueue: (update: (queue: QueueItem[]) => QueueItem[]) => void;
  /** Free slots in the post (10 − attached). */
  room: number;
  onClose: () => void;
  onAdd: (items: PostMedia[]) => void;
  newId: () => string;
};

/** Desktop «Добавление медиа» (posts-02, left half). */
export function AddMediaDialog({ initialTab, queue, setQueue, room, onClose, onAdd, newId }: DialogProps) {
  const [tab, setTab] = useState<string>(initialTab);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useQueueTicker(setQueue, true);

  const ready = queue.filter((item) => item.state === 'ready');
  const counted = queue.filter((item) => item.state !== 'failed').length;

  function onFiles(files: File[]) {
    const free = Math.max(room - counted, 0);
    const accepted = files.slice(0, free);
    if (files.length > accepted.length) setNote('В посте не больше 10 файлов');
    else setNote(null);
    setQueue((q) => [...q, ...accepted.map((file) => queueItemFor(file, newId()))]);
  }

  function addToPost() {
    if (tab === 'pc') {
      onAdd(
        ready.map((item) => ({
          id: newId(),
          name: item.name,
          kind: item.kind,
          src: item.src ?? LIBRARY.find((l) => l.name === item.name)?.src ?? LIBRARY[0]!.src,
          original: item.src ?? LIBRARY.find((l) => l.name === item.name)?.src ?? LIBRARY[0]!.src,
          meta: item.meta,
          status: 'ready',
          progress: 100,
          ...(item.kind === 'video' ? { duration: '01:24' } : {})
        }))
      );
      setQueue((q) => q.filter((item) => item.state !== 'ready'));
    } else {
      onAdd(LIBRARY.filter((item) => picked.has(item.id)).map((item) => ({ ...item, id: newId() })));
    }
  }

  const count = tab === 'pc' ? ready.length : picked.size;
  const full = tab !== 'pc' && picked.size >= room;

  return (
    <Dialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="media"
      title="Добавление медиа"
      footer={
        <>
          <Button
            variant="secondary"
            size="lg"
            className={styles.cancel}
            onPress={() => (queue.length > 0 && tab === 'pc' ? setConfirmDiscard(true) : onClose())}
          >
            Отмена
          </Button>
          <Button icon="plus" size="lg" className={styles.add} isDisabled={count === 0} onPress={addToPost}>
            {tab === 'pc' && !queue.some((item) => item.state === 'uploading')
              ? 'Добавить в пост'
              : `Добавить (${count})`}
          </Button>
        </>
      }
    >
      <div className={styles.dialogBody}>
        <Tabs variant="card" selectedKey={tab} onSelectionChange={(key) => setTab(String(key))}>
          <TabList aria-label="Источник файлов">
            <Tab id="pc" icon="laptop" hint="Файлы с устройства">
              С компьютера
            </Tab>
            <Tab id="library" icon="image" hint="Ваши сохранённые файлы">
              Медиабиблиотека
            </Tab>
            <Tab id="recent" icon="clock" hint="Ранее загруженные файлы">
              Недавние
            </Tab>
          </TabList>
          <TabPanel id="pc">
            <Dropzone
              size="xl"
              actionSize="lg"
              title="Перетащите фото и видео сюда"
              subtitle="или выберите файлы на устройстве"
              dropLabel="Отпустите файлы"
              actionLabel="Выбрать файлы"
              actionIcon="image-plus"
              accept={[...ACCEPT]}
              onFiles={onFiles}
            >
              Фото — JPG, PNG, WebP до 10 МБ; GIF и видео MP4 — до 50 МБ. В посте до 10 файлов.
            </Dropzone>
          </TabPanel>
          <TabPanel id="library">
            <Library
              mode="library"
              selected={picked}
              full={full}
              onToggle={(id, on) =>
                setPicked((prev) => {
                  const next = new Set(prev);
                  if (on) next.add(id);
                  else next.delete(id);
                  return next;
                })
              }
            />
          </TabPanel>
          <TabPanel id="recent">
            <Library
              mode="recent"
              selected={picked}
              full={full}
              onToggle={(id, on) =>
                setPicked((prev) => {
                  const next = new Set(prev);
                  if (on) next.add(id);
                  else next.delete(id);
                  return next;
                })
              }
            />
          </TabPanel>
        </Tabs>
        {note ? <Banner tone="warning" title={note} /> : null}
        {confirmDiscard ? (
          <Banner
            tone="warning"
            title={`Отменить загрузку файлов: ${queue.length}?`}
            action={
              <>
                <Button size="sm" variant="secondary" onPress={() => setConfirmDiscard(false)}>
                  Вернуться
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onPress={() => {
                    setQueue(() => []);
                    setConfirmDiscard(false);
                    onClose();
                  }}
                >
                  Отменить загрузку
                </Button>
              </>
            }
          >
            Файлы из очереди не попадут в пост.
          </Banner>
        ) : null}
        {tab === 'pc' && queue.length > 0 ? (
          <section className={styles.queue} aria-label="Выбранные файлы">
            <div className={styles.queueHead}>
              <h3 className={styles.queueTitle}>Выбранные файлы ({queue.length})</h3>
              <Button variant="secondary" size="sm" icon="trash" onPress={() => setQueue(() => [])}>
                Очистить всё
              </Button>
            </div>
            <div className={styles.rows}>
              {queue.map((item) => (
                <UploadRow
                  thumb="landscape"
                  key={item.id}
                  name={item.name}
                  meta={item.meta}
                  kind={item.kind}
                  src={item.src}
                  state={item.state}
                  progress={item.progress}
                  statusLabel={item.state === 'uploading' ? `${item.label}` : item.label}
                  removeLabel={`Убрать ${item.name}`}
                  onRemove={() => setQueue((q) => q.filter((x) => x.id !== item.id))}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </Dialog>
  );
}

type SheetProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onFiles: (files: File[]) => void;
  onLibrary: () => void;
};

/** Phone «Добавить фото и видео» bottom sheet (posts-03, left phone). */
export function SourceSheet({ isOpen, onOpenChange, onFiles, onLibrary }: SheetProps) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const handle = (files: FileList | null) => {
    if (files && files.length > 0) onFiles(Array.from(files));
    onOpenChange(false);
  };
  return (
    <>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        data-testid="camera-input"
        onChange={(e) => handle(e.currentTarget.files)}
      />
      <input
        ref={gallery}
        type="file"
        accept={ACCEPT.join(',')}
        multiple
        hidden
        data-testid="gallery-input"
        onChange={(e) => handle(e.currentTarget.files)}
      />
      <BottomSheet
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        title="Добавить фото и видео"
        footer={
          <Button variant="secondary" fullWidth size="lg" onPress={() => onOpenChange(false)}>
            Отмена
          </Button>
        }
      >
        <ActionRow
          icon="camera"
          title="Снять фото"
          hint="Открыть камеру устройства"
          onPress={() => camera.current?.click()}
        />
        <ActionRow
          icon="image"
          title="Выбрать из галереи"
          hint="Фото и видео с устройства"
          onPress={() => gallery.current?.click()}
        />
        <ActionRow
          icon="folder"
          title="Открыть медиабиблиотеку"
          hint="Ваши сохранённые файлы"
          onPress={() => {
            onOpenChange(false);
            onLibrary();
          }}
        />
      </BottomSheet>
    </>
  );
}

export { POST_MEDIA_MAX_ITEMS };
