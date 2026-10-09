/* oxlint-disable react/set-state-in-effect, jsx-a11y/prefer-tag-over-role -- dev-only prototype: resets local mock state on open/visit and uses simple ARIA roles */
import { useEffect, useRef, useState } from 'react';
import {
  Banner,
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  Drawer,
  Icon,
  IconButton,
  Menu,
  Panel,
  Select,
  DateTimeField,
  SegmentedControl,
  StatusBadge,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  TelegramPreview
} from '../../shared/ui';
import { fromAbsolute, type ZonedDateTime } from '@internationalized/date';
import { formatDateTime } from './data';
import { NOW } from './data';
import { PublishDialog, ZONE } from './PublishDialog';
import { channelName, shortChannel } from './parts';
import { useNarrow, useProtoNavigate, useProtoPath, useProtoSearch, useProtoSearchUpdate } from './proto-kit';
import { useProtoStore } from './proto-store';
import styles from './Editor.module.css';
import thumbArcana from './assets/thumb-arcana.svg';
import thumbPatch from './assets/thumb-patch.svg';
import thumbHero from './assets/thumb-hero.svg';
import thumbStream from './assets/thumb-stream.svg';

const LIMIT = 4096;
type Save = 'idle' | 'dirty' | 'saving' | 'saved' | 'failed';
type Mobile = 'text' | 'preview' | 'settings';
type EditorView = 'edit' | 'preview' | 'settings';
type DemoMediaStatus = 'queued' | 'uploading' | 'processing' | 'ready' | 'failed' | 'cancelled';
type DemoMedia = {
  id: string;
  name: string;
  kind: 'photo' | 'video';
  thumbnail: string;
  status: DemoMediaStatus;
  progress: number;
};

const LIBRARY_MEDIA: DemoMedia[] = [
  {
    id: 'lib-arcana',
    name: 'arcana-preview.jpg',
    kind: 'photo',
    thumbnail: thumbArcana,
    status: 'ready',
    progress: 100
  },
  { id: 'lib-patch', name: 'patch-notes.jpg', kind: 'photo', thumbnail: thumbPatch, status: 'ready', progress: 100 },
  {
    id: 'lib-hero-video',
    name: 'hero-teaser.mp4',
    kind: 'video',
    thumbnail: thumbHero,
    status: 'ready',
    progress: 100
  },
  {
    id: 'lib-stream',
    name: 'stream-announcement.jpg',
    kind: 'photo',
    thumbnail: thumbStream,
    status: 'ready',
    progress: 100
  }
];

const sampleGallery = (): DemoMedia[] => [
  { ...LIBRARY_MEDIA[0]!, id: 'draft-arcana' },
  { ...LIBRARY_MEDIA[2]!, id: 'draft-video' },
  { ...LIBRARY_MEDIA[1]!, id: 'draft-patch' }
];

function initialDemoMedia(state: string | undefined): DemoMedia[] {
  if (state === 'gallery' || state === 'preview' || state === 'settings' || state === 'confirm') return sampleGallery();
  if (state === 'upload-error') return [{ ...LIBRARY_MEDIA[0]!, id: 'failed-thumb', status: 'failed', progress: 68 }];
  return [];
}

const clock = () => {
  const date = new Date();
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

function SaveIndicator({
  save,
  savedAt,
  offline,
  onRetry
}: {
  save: Save;
  savedAt: string;
  offline: boolean;
  onRetry: () => void;
}) {
  return (
    <span className={styles.save} data-state={offline ? 'failed' : save} role="status">
      {offline ? (
        <>
          <Icon name="alert" size={14} /> Нет соединения
        </>
      ) : save === 'saving' ? (
        'Сохраняем…'
      ) : save === 'dirty' ? (
        'Не сохранено'
      ) : save === 'saved' ? (
        <>
          <Icon name="check" size={14} /> Сохранено, {savedAt}
        </>
      ) : save === 'failed' ? (
        <>
          <Icon name="alert" size={14} /> Не удалось сохранить
          <button type="button" className={styles.retry} onClick={onRetry}>
            Повторить
          </button>
        </>
      ) : (
        <span className={styles.slot} />
      )}
    </span>
  );
}

type SourceStep = 'sources' | 'device' | 'library';

function MediaSourcePicker({
  isOpen,
  onOpenChange,
  narrow,
  step,
  setStep,
  filter,
  setFilter,
  selection,
  setSelection,
  onAdd
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  narrow: boolean;
  step: SourceStep;
  setStep: (step: SourceStep) => void;
  filter: 'all' | 'photo' | 'video';
  setFilter: (filter: 'all' | 'photo' | 'video') => void;
  selection: string[];
  setSelection: (ids: string[]) => void;
  onAdd: (items: DemoMedia[]) => void;
}) {
  const visible = LIBRARY_MEDIA.filter((item) => filter === 'all' || item.kind === filter);
  const title = step === 'sources' ? 'Добавить медиа' : step === 'device' ? 'Демо-выбор файлов' : 'Медиабиблиотека';
  const description =
    step === 'sources'
      ? 'Выберите источник. Прототип не открывает устройство и не загружает файлы.'
      : step === 'device'
        ? 'Выберите демонстрационные файлы вместо системного диалога.'
        : 'Выберите несколько тестовых файлов из общей медиатеки.';
  const content = (
    <div className={styles.sourceContent}>
      {step === 'sources' ? (
        <>
          <Button
            icon="upload"
            onPress={() => {
              setSelection([]);
              setStep('device');
            }}
          >
            С компьютера · демо
          </Button>
          <Button
            variant="secondary"
            icon="image"
            onPress={() => {
              setSelection([]);
              setFilter('all');
              setStep('library');
            }}
          >
            Из медиабиблиотеки
          </Button>
          <p className={styles.hint}>Выбор локальный и существует только пока открыта вкладка прототипа.</p>
        </>
      ) : (
        <>
          {step === 'library' ? (
            <SegmentedControl
              label="Тип медиа"
              value={filter}
              onChange={(value) => setFilter(value as 'all' | 'photo' | 'video')}
              options={[
                { id: 'all', label: 'Все' },
                { id: 'photo', label: 'Фото' },
                { id: 'video', label: 'Видео' }
              ]}
              fullWidth
            />
          ) : null}
          <ul className={styles.sourceList}>
            {visible.map((item) => (
              <li key={item.id}>
                <Checkbox
                  isSelected={selection.includes(item.id)}
                  onChange={(checked) =>
                    setSelection(checked ? [...selection, item.id] : selection.filter((id) => id !== item.id))
                  }
                >
                  <span className={styles.sourceChoice}>
                    <img src={item.thumbnail} alt="" />
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.kind === 'video' ? 'Видео · демонстрационный постер' : 'Фото · демо-файл'}</small>
                    </span>
                  </span>
                </Checkbox>
              </li>
            ))}
          </ul>
          {visible.length === 0 ? <p className={styles.hint}>В этом разделе нет демонстрационных файлов.</p> : null}
        </>
      )}
    </div>
  );
  const footer =
    step === 'sources' ? (
      <Button variant="secondary" onPress={() => onOpenChange(false)}>
        Отмена
      </Button>
    ) : (
      <>
        <Button variant="secondary" onPress={() => setStep('sources')}>
          Назад
        </Button>
        <Button
          isDisabled={selection.length === 0}
          onPress={() => {
            onAdd(LIBRARY_MEDIA.filter((item) => selection.includes(item.id)));
            setSelection([]);
            setStep('sources');
            onOpenChange(false);
          }}
        >
          Добавить выбранные ({selection.length})
        </Button>
      </>
    );

  return narrow ? (
    <Drawer isOpen={isOpen} onOpenChange={onOpenChange} title={title} variant="bottom" footer={footer}>
      <p className={styles.sourceDescription}>{description}</p>
      {content}
    </Drawer>
  ) : (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="wide"
      footer={footer}
    >
      {content}
    </Dialog>
  );
}

function DemoMediaGallery({
  media,
  onMove,
  onRemove,
  onRetry,
  onCancel
}: {
  media: DemoMedia[];
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  if (media.length === 0) {
    return (
      <div className={styles.dropzone}>
        <Icon name="upload" size={22} />
        <strong>Перетащите файлы сюда или выберите источник</strong>
        <span>В прототипе доступен только демонстрационный выбор.</span>
      </div>
    );
  }
  return (
    <ol className={styles.mediaGrid} aria-label="Демо-вложения поста">
      {media.map((item, index) => (
        <li className={styles.mediaItem} key={item.id}>
          <div className={styles.mediaThumb}>
            <img src={item.thumbnail} alt={`Демо-превью: ${item.name}`} />
            {item.kind === 'video' ? <span className={styles.videoMark}>Видео</span> : null}
            {index === 0 ? <span className={styles.firstMark}>Первое</span> : null}
          </div>
          <div className={styles.mediaInfo}>
            <strong>{item.name}</strong>
            <span>{item.kind === 'video' ? 'Видео · демонстрационный постер' : 'Фото · тестовое изображение'}</span>
            {item.status === 'uploading' || item.status === 'processing' ? (
              <>
                <progress aria-label={`Демо-загрузка ${item.name}`} max={100} value={item.progress} />
                <small>{item.status === 'processing' ? 'Демо: обработка' : `Демо-загрузка · ${item.progress}%`}</small>
              </>
            ) : null}
            {item.status === 'ready' ? (
              <small>
                <Icon name="check-circle" size={14} /> Демо: готово
              </small>
            ) : null}
            {item.status === 'failed' ? (
              <small className={styles.mediaError}>
                <Icon name="alert" size={14} /> Демо: не удалось загрузить
              </small>
            ) : null}
            {item.status === 'cancelled' ? <small>Демо: загрузка остановлена, файл не добавлен</small> : null}
          </div>
          <div className={styles.mediaControls}>
            <Button
              variant="ghost"
              size="sm"
              icon="arrow-up"
              aria-label={`Переместить ${item.name} выше`}
              isDisabled={index === 0}
              onPress={() => onMove(item.id, -1)}
            />
            <Button
              variant="ghost"
              size="sm"
              icon="arrow-down"
              aria-label={`Переместить ${item.name} ниже`}
              isDisabled={index === media.length - 1}
              onPress={() => onMove(item.id, 1)}
            />
            {item.status === 'uploading' ? (
              <Button
                variant="ghost"
                size="sm"
                icon="x"
                aria-label={`Отменить демо-загрузку ${item.name}`}
                onPress={() => onCancel(item.id)}
              />
            ) : item.status === 'failed' || item.status === 'cancelled' ? (
              <Button variant="secondary" size="sm" icon="retry" onPress={() => onRetry(item.id)}>
                Повторить
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              icon="trash"
              aria-label={`Убрать ${item.name} из демо-поста`}
              onPress={() => onRemove(item.id)}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

function DemoPreview({
  title,
  body,
  media,
  current,
  setCurrent
}: {
  title: string;
  body: string;
  media: DemoMedia[];
  current: number;
  setCurrent: (index: number) => void;
}) {
  const selected = media[current];
  return (
    <div className={styles.previewStack}>
      {selected ? (
        <div className={styles.previewMedia}>
          <img src={selected.thumbnail} alt={`Демо-превью: ${selected.name}`} />
          {selected.kind === 'video' ? <span className={styles.videoMark}>Видео · демо-постер</span> : null}
          {media.length > 1 ? (
            <div className={styles.carousel}>
              <Button
                variant="secondary"
                size="sm"
                icon="chevron-left"
                aria-label="Предыдущее медиа"
                onPress={() => setCurrent((current + media.length - 1) % media.length)}
              />
              <span>
                {current + 1} из {media.length}
              </span>
              <Button
                variant="secondary"
                size="sm"
                icon="chevron-right"
                aria-label="Следующее медиа"
                onPress={() => setCurrent((current + 1) % media.length)}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      {title || body ? (
        <TelegramPreview title={title || undefined} body={body || 'Текст поста появится здесь.'} />
      ) : (
        <p className={styles.sideEmpty}>Предпросмотр появится после ввода заголовка или текста.</p>
      )}
      <span className={styles.demoNote}>Демо-предпросмотр · данные не отправляются</span>
    </div>
  );
}

export function EditorScreen() {
  const narrow = useNarrow();
  const path = useProtoPath();
  const search = useProtoSearch();
  const update = useProtoSearchUpdate();
  const go = useProtoNavigate();
  const { posts, channels, createPost, updatePost, returnToDraft, offline } = useProtoStore();
  const routeId = path.split('/')[1] ?? 'new';
  const [createdId, setCreatedId] = useState<string | null>(null);
  const id = routeId === 'new' ? createdId : routeId;
  const post = posts.find((p) => p.id === id);
  const forcedContent = ['gallery', 'preview', 'settings', 'confirm', 'upload-error'].includes(search.state ?? '');
  const [title, setTitle] = useState(post?.title ?? (forcedContent ? 'Обновление патча 7.41' : ''));
  const [body, setBody] = useState(
    post?.body ?? (forcedContent ? 'Короткий обзор изменений и новых предметов. Подробности — в нашем разборе.' : '')
  );
  const [save, setSave] = useState<Save>('idle');
  const [savedAt, setSavedAt] = useState(clock());
  const [mobileTab, setMobileTab] = useState<Mobile>('text');
  const [view, setView] = useState<EditorView>('edit');
  const [media, setMedia] = useState<DemoMedia[]>(() => initialDemoMedia(search.state));
  const [sourceOpen, setSourceOpen] = useState(search.state === 'media-source');
  const [sourceStep, setSourceStep] = useState<SourceStep>('sources');
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'photo' | 'video'>('all');
  const [mediaSelection, setMediaSelection] = useState<string[]>([]);
  const [currentMedia, setCurrentMedia] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [destinationId, setDestinationId] = useState(
    channels.find((channel) => channel.state === 'ok' && channel.enabled)?.id ?? ''
  );
  const [publishMode, setPublishMode] = useState<'now' | 'later'>('now');
  const [scheduledAt, setScheduledAt] = useState<ZonedDateTime>(() => fromAbsolute(NOW + 4 * 3_600_000, ZONE));
  const [confirmOpen, setConfirmOpen] = useState(search.state === 'confirm');
  const [demoResult, setDemoResult] = useState('');
  const [publishOpen, setPublishOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [dirtyTick, setDirtyTick] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null);
  const mediaSequence = useRef(0);
  const uploadTimers = useRef(new Map<string, ReturnType<typeof setTimeout>[]>());
  const mini = search.mini === '1';
  const keyboard = search.state === 'keyboard' && narrow;
  const forcedFail = search.state === 'failed';
  const readOnly = Boolean(post && post.state !== 'draft');
  const forcedView: EditorView | undefined =
    search.state === 'settings' || search.state === 'confirm'
      ? 'settings'
      : search.state === 'preview'
        ? 'preview'
        : undefined;
  const activeView = forcedView ?? view;

  useEffect(() => {
    const forced = search.state;
    if (forced === 'media-source') {
      setSourceOpen(true);
      setSourceStep('sources');
    } else if (
      forced === 'gallery' ||
      forced === 'preview' ||
      forced === 'settings' ||
      forced === 'confirm' ||
      forced === 'upload-error'
    ) {
      setMedia(initialDemoMedia(forced));
      setTitle((current) => current || 'Обновление патча 7.41');
      setBody((current) => current || 'Короткий обзор изменений и новых предметов. Подробности — в нашем разборе.');
      setSourceOpen(false);
      if (forced === 'preview') setMobileTab('preview');
      if (forced === 'settings' || forced === 'confirm') setMobileTab('settings');
      if (forced === 'confirm') setConfirmOpen(true);
    }
  }, [search.state]);

  useEffect(
    () => () => {
      for (const timers of uploadTimers.current.values()) timers.forEach(clearTimeout);
      uploadTimers.current.clear();
    },
    []
  );

  const clearUploadTimers = (mediaId: string) => {
    uploadTimers.current.get(mediaId)?.forEach(clearTimeout);
    uploadTimers.current.delete(mediaId);
  };

  const startMockUpload = (mediaId: string, shouldFail = false) => {
    clearUploadTimers(mediaId);
    setMedia((items) =>
      items.map((item) => (item.id === mediaId ? { ...item, status: 'uploading', progress: 24 } : item))
    );
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(
      setTimeout(() => {
        setMedia((items) => items.map((item) => (item.id === mediaId ? { ...item, progress: 68 } : item)));
      }, 500)
    );
    timers.push(
      setTimeout(() => {
        setMedia((items) =>
          items.map((item) => (item.id === mediaId ? { ...item, status: 'processing', progress: 92 } : item))
        );
      }, 1000)
    );
    timers.push(
      setTimeout(() => {
        setMedia((items) =>
          items.map((item) =>
            item.id === mediaId
              ? { ...item, status: shouldFail ? 'failed' : 'ready', progress: shouldFail ? 92 : 100 }
              : item
          )
        );
        uploadTimers.current.delete(mediaId);
      }, 1550)
    );
    uploadTimers.current.set(mediaId, timers);
  };

  const addDemoMedia = (picked: DemoMedia[]) => {
    const additions = picked.map((item) => ({
      ...item,
      id: `demo-${++mediaSequence.current}-${item.id}`,
      status: 'queued' as const,
      progress: 0
    }));
    setMedia((items) => [...items, ...additions]);
    additions.forEach((item) => startMockUpload(item.id));
    setCurrentMedia(Math.max(0, media.length));
  };

  const moveDemoMedia = (mediaId: string, direction: -1 | 1) => {
    setMedia((items) => {
      const index = items.findIndex((item) => item.id === mediaId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= items.length) return items;
      const next = [...items];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  };

  const removeDemoMedia = (mediaId: string) => {
    clearUploadTimers(mediaId);
    setMedia((items) => items.filter((item) => item.id !== mediaId));
    setCurrentMedia(0);
  };

  const cancelDemoUpload = (mediaId: string) => {
    clearUploadTimers(mediaId);
    setMedia((items) =>
      items.map((item) => (item.id === mediaId ? { ...item, status: 'cancelled', progress: 0 } : item))
    );
  };

  // Autosave: the draft is created silently on the first non-empty text, then every pause saves it.
  useEffect(() => {
    if (dirtyTick === 0 || readOnly) return;
    setSave('dirty');
    const first = setTimeout(() => {
      setSave('saving');
    }, 600);
    const second = setTimeout(() => {
      if (forcedFail || offline) {
        setSave('failed');
        return;
      }
      if (!id && (title.trim() || body.trim())) {
        const created = createPost(title, body);
        setCreatedId(created);
        go(`posts/${created}`, {}, true);
      } else if (id) {
        updatePost(id, { title, body });
      }
      setSavedAt(clock());
      setSave(id || title.trim() || body.trim() ? 'saved' : 'idle');
    }, 1300);
    return () => {
      clearTimeout(first);
      clearTimeout(second);
    };
  }, [dirtyTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const edit = (next: { title?: string; body?: string }) => {
    if (next.title !== undefined) setTitle(next.title);
    if (next.body !== undefined) setBody(next.body);
    setDirtyTick((value) => value + 1);
  };
  const wrap = (mark: string) => {
    const el = area.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    edit({ body: `${body.slice(0, a)}${mark}${body.slice(a, b)}${mark}${body.slice(b)}` });
  };

  const length = body.length;
  const ratio = length / LIMIT;
  const counter = length > LIMIT ? `Превышен лимит на ${length - LIMIT}` : ratio >= 0.9 ? 'Почти лимит' : '';
  const mockMediaReady = media.length > 0 && media.every((item) => item.status === 'ready');
  const saved =
    (Boolean(post) || forcedContent || mockMediaReady) && save !== 'dirty' && save !== 'saving' && save !== 'failed';
  const hasContent = Boolean(title.trim() || body.trim() || media.length > 0);

  const back = () => (save === 'failed' ? setLeaveOpen(true) : go('posts'));
  const state = post?.state ?? 'draft';
  const primary =
    state === 'draft' ? (
      <Button
        isDisabled={!saved || !hasContent || offline || length > LIMIT}
        onPress={() => {
          setView('settings');
          setMobileTab('settings');
        }}
      >
        Настроить публикацию
      </Button>
    ) : state === 'approved' || state === 'sent' ? (
      <Button icon="send" isDisabled={offline} onPress={() => setPublishOpen(true)}>
        Опубликовать…
      </Button>
    ) : null;
  const primaryLabel = state === 'draft' ? 'Настроить публикацию' : 'Опубликовать…';

  const menu = (
    <Menu
      label="Действия с постом"
      items={[
        { id: 'history', label: 'История правок', icon: 'clock', isDisabled: true },
        ...(state === 'approved' ? [{ id: 'draft', label: 'Вернуть в черновик', icon: 'retry' as const }] : []),
        { id: 'delete', label: 'Удалить', icon: 'trash', tone: 'danger' as const, isDisabled: !id }
      ]}
      onAction={(action) => {
        if (action === 'draft' && id) returnToDraft(id);
        if (action === 'delete') go('posts');
      }}
    />
  );

  const preview = (
    <DemoPreview title={title} body={body} media={media} current={currentMedia} setCurrent={setCurrentMedia} />
  );
  const writing = (
    <div className={styles.field} data-readonly={readOnly || undefined}>
      <div className={styles.format} role="toolbar" aria-label="Форматирование">
        {(
          [
            ['b', 'Жирный', '**'],
            ['i', 'Курсив', '_'],
            ['u', 'Подчёркнутый', '__'],
            ['s', 'Зачёркнутый', '~~']
          ] as const
        ).map(([glyph, label, mark]) => (
          <button
            key={glyph}
            type="button"
            className={styles.mark}
            aria-label={label}
            disabled={readOnly}
            onClick={() => wrap(mark)}
          >
            <span data-glyph={glyph}>{glyph.toUpperCase()}</span>
          </button>
        ))}
        <IconButton label="Ссылка" icon="link" size="sm" isDisabled={readOnly} showTooltip={false} />
        <Menu
          label="Ещё форматирование"
          items={[
            { id: 'code', label: 'Код' },
            { id: 'quote', label: 'Цитата' },
            { id: 'list', label: 'Список' }
          ]}
          onAction={(action) => wrap(action === 'code' ? '`' : action === 'quote' ? '> ' : '- ')}
        />
      </div>
      <textarea
        ref={area}
        className={styles.area}
        aria-label="Текст поста"
        placeholder="Напишите текст поста…"
        value={body}
        readOnly={readOnly}
        onChange={(event) => edit({ body: event.target.value })}
      />
      <div className={styles.counter} data-level={length > LIMIT ? 'over' : ratio >= 0.9 ? 'warn' : undefined}>
        {counter ? <span>{counter} · </span> : null}
        <span className={styles.mono}>
          {length} / {LIMIT}
        </span>
      </div>
    </div>
  );

  const mediaSection = (
    <Panel
      title="Фото и видео"
      note="Демо-материалы"
      action={
        <Button
          variant={media.length === 0 ? 'primary' : 'secondary'}
          icon="plus"
          isDisabled={readOnly || media.length >= 10}
          onPress={() => {
            setSourceStep('sources');
            setSourceOpen(true);
          }}
        >
          Добавить медиа
        </Button>
      }
    >
      <div className={styles.mediaSection}>
        {offline ? (
          <Banner tone="warning" title="Демо: нет соединения">
            В этом состоянии mock-сохранение и продолжение отключены.
          </Banner>
        ) : null}
        <DemoMediaGallery
          media={media}
          onMove={moveDemoMedia}
          onRemove={removeDemoMedia}
          onRetry={(mediaId) => startMockUpload(mediaId)}
          onCancel={cancelDemoUpload}
        />
        <p className={styles.demoNote}>Имена, миниатюры и прогресс — демонстрационные. Файлы не загружаются.</p>
      </div>
    </Panel>
  );

  const editContent = (
    <div className={styles.editStack}>
      {writing}
      {mediaSection}
      <Button
        variant="secondary"
        icon="image"
        onPress={() => {
          setCurrentMedia(0);
          setView('preview');
          setMobileTab('preview');
        }}
      >
        Открыть предпросмотр
      </Button>
    </div>
  );

  const selectedChannel = channels.find((channel) => channel.id === destinationId);
  const channelOptions = channels.map((channel) => ({
    id: channel.id,
    label: shortChannel(channelName(channels, channel.id)),
    description: channel.state === 'ok' && channel.enabled ? 'Демо-канал доступен' : 'Демо: публикация недоступна',
    isDisabled: channel.state !== 'ok' || !channel.enabled
  }));
  const readyToConfirm =
    Boolean(title.trim()) && media.every((item) => item.status === 'ready') && !offline && save !== 'failed';
  const scheduledValid = publishMode === 'now' || scheduledAt.toDate().getTime() > NOW;
  const settings = (
    <div className={styles.settings}>
      <div className={styles.settingsIntro}>
        <h2>Настройки публикации</h2>
        <p>Демо-режим: выборы остаются в прототипе и не отправляются в Telegram.</p>
      </div>
      <div className={styles.sideBox}>{preview}</div>
      <Select
        label="Канал"
        options={channelOptions}
        value={destinationId || null}
        onChange={(value) => setDestinationId(value ?? '')}
        isRequired
        placeholder="Выберите канал"
      />
      <SegmentedControl
        label="Когда опубликовать"
        value={publishMode}
        onChange={(value) => setPublishMode(value === 'later' ? 'later' : 'now')}
        options={[
          { id: 'now', label: 'Опубликовать сейчас' },
          { id: 'later', label: 'Запланировать' }
        ]}
        fullWidth
      />
      {publishMode === 'later' ? (
        <DateTimeField
          label="Дата и время"
          value={scheduledAt}
          onChange={(value) => {
            if (value) setScheduledAt(value);
          }}
          timeZone={ZONE}
          description={`Часовой пояс: ${ZONE}`}
          minValue={fromAbsolute(NOW, ZONE)}
          isRequired
        />
      ) : null}
      <p className={styles.timezone}>
        Время отображается в {ZONE}.{' '}
        {publishMode === 'later'
          ? `Демо: ${formatDateTime(scheduledAt.toDate().getTime())}.`
          : 'Публикация сейчас — только демонстрационный сценарий.'}
      </p>
      <section className={styles.readiness} aria-label="Готовность демо-поста">
        <h3>Готовность</h3>
        <ul>
          <li>
            <Icon name={title.trim() ? 'check-circle' : 'alert'} size={16} /> Заголовок{' '}
            {title.trim() ? 'добавлен' : 'нужен'}
          </li>
          <li>
            <Icon name={media.every((item) => item.status === 'ready') ? 'check-circle' : 'info'} size={16} /> Медиа:{' '}
            {media.length === 0
              ? 'без вложений'
              : `${media.filter((item) => item.status === 'ready').length} из ${media.length} демо-файлов готовы`}
          </li>
          <li>
            <Icon name={selectedChannel ? 'check-circle' : 'alert'} size={16} />{' '}
            {selectedChannel ? `Канал: ${shortChannel(channelName(channels, selectedChannel.id))}` : 'Выберите канал'}
          </li>
        </ul>
      </section>
      {demoResult ? (
        <p className={styles.demoResult} role="status">
          {demoResult}
        </p>
      ) : null}
      <div className={styles.settingsActions}>
        <Button
          variant="secondary"
          icon="chevron-left"
          onPress={() => {
            setView('edit');
            setMobileTab('text');
          }}
        >
          Вернуться к редактору
        </Button>
        <Button
          icon={publishMode === 'now' ? 'send' : 'calendar'}
          isDisabled={!destinationId || !readyToConfirm || !scheduledValid}
          onPress={() => setConfirmOpen(true)}
        >
          Проверить и подтвердить
        </Button>
      </div>
    </div>
  );

  return (
    <div
      className={styles.editor}
      data-mini={mini || undefined}
      data-keyboard={keyboard || undefined}
      data-source-picker={sourceOpen || undefined}
    >
      <h1 className={styles.srOnly}>Редактор поста</h1>
      <header className={styles.header}>
        <Button variant="ghost" icon="chevron-left" onPress={back}>
          Посты
        </Button>
        <input
          className={styles.title}
          aria-label="Заголовок"
          placeholder="Заголовок"
          value={title}
          readOnly={readOnly}
          onChange={(event) => edit({ title: event.target.value })}
        />
        <div className={styles.status}>
          {narrow ? null : (
            <SaveIndicator
              save={readOnly ? 'idle' : save}
              savedAt={savedAt}
              offline={offline}
              onRetry={() => {
                update({ state: undefined });
                setDirtyTick((v) => v + 1);
              }}
            />
          )}
          {post ? <StatusBadge status={post.state} /> : null}
          {menu}
        </div>
        {!narrow && primary ? <div className={styles.primary}>{primary}</div> : null}
      </header>

      {search.state === 'conflict' ? (
        <Banner
          tone="conflict"
          title="Изменено на другом устройстве"
          action={
            <Button variant="secondary" size="sm" onPress={() => update({ state: undefined })}>
              Обновить
            </Button>
          }
        >
          Ваши правки не потеряются, пока вы не обновите страницу.
        </Banner>
      ) : null}
      {readOnly ? (
        <Banner
          tone="info"
          title={state === 'approved' ? 'Пост одобрен и защищён от правок' : 'Редактирование недоступно'}
          action={
            state === 'approved' ? (
              <Button variant="secondary" size="sm" onPress={() => id && returnToDraft(id)}>
                Вернуть в черновик
              </Button>
            ) : undefined
          }
        >
          {state === 'approved' ? 'Опубликуйте его или верните в черновик.' : 'Пост уже ушёл в публикацию.'}
        </Banner>
      ) : null}

      {narrow ? (
        <div className={styles.mobile}>
          <SegmentedControl
            label="Раздел поста"
            fullWidth
            value={mobileTab}
            onChange={(value) => setMobileTab(value as Mobile)}
            options={[
              { id: 'text', label: 'Текст' },
              { id: 'preview', label: 'Превью' },
              { id: 'settings', label: 'Настройки' }
            ]}
          />
          {mobileTab === 'text' ? (
            editContent
          ) : mobileTab === 'preview' ? (
            <div className={styles.sideBox}>
              {preview}
              <Button variant="secondary" onPress={() => setPreviewOpen(true)}>
                Открыть крупно
              </Button>
            </div>
          ) : (
            settings
          )}
        </div>
      ) : (
        <div className={styles.columns}>
          <div className={styles.write}>
            {activeView === 'settings' ? (
              settings
            ) : activeView === 'preview' ? (
              <div className={styles.sideBox}>
                {preview}
                <Button variant="secondary" onPress={() => setPreviewOpen(true)}>
                  Открыть крупно
                </Button>
              </div>
            ) : (
              editContent
            )}
          </div>
          <aside className={styles.side}>
            <Tabs defaultSelectedKey="preview">
              <TabList aria-label="Боковая панель">
                <Tab id="preview">Превью</Tab>
                <Tab id="settings">Настройки</Tab>
              </TabList>
              <TabPanel id="preview">
                <div className={styles.sideBox}>{preview}</div>
              </TabPanel>
              <TabPanel id="settings">
                <div className={styles.sideBox}>{settings}</div>
              </TabPanel>
            </Tabs>
          </aside>
        </div>
      )}

      {narrow && primary && !mini ? (
        <div className={styles.actionBar}>
          <span className={styles.barNote}>
            <SaveIndicator
              save={readOnly ? 'idle' : save}
              savedAt={savedAt}
              offline={offline}
              onRetry={() => setDirtyTick((v) => v + 1)}
            />
          </span>
          {primary}
        </div>
      ) : null}
      {mini && primary ? (
        <div className={styles.mainButton} role="presentation">
          {primaryLabel}
          <span className={styles.mainHint}>MainButton Telegram</span>
        </div>
      ) : null}
      {keyboard ? (
        <div className={styles.keyboard} aria-hidden="true">
          клавиатура телефона
        </div>
      ) : null}

      <ConfirmDialog
        isOpen={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={publishMode === 'now' ? 'Подтвердить демо-публикацию?' : 'Подтвердить демо-планирование?'}
        description={`${selectedChannel ? shortChannel(channelName(channels, selectedChannel.id)) : 'Канал не выбран'} · ${publishMode === 'now' ? 'сейчас' : formatDateTime(scheduledAt.toDate().getTime())}. Ничего не будет отправлено.`}
        confirmLabel="Подтвердить демо"
        cancelLabel="Вернуться к настройкам"
        tone="default"
        onConfirm={() => {
          setDemoResult(
            publishMode === 'now'
              ? 'Демо подтверждено: публикация не отправлена.'
              : 'Демо подтверждено: расписание не создано.'
          );
          setConfirmOpen(false);
          update({ state: undefined });
        }}
      />
      <MediaSourcePicker
        isOpen={sourceOpen}
        onOpenChange={setSourceOpen}
        narrow={narrow}
        step={sourceStep}
        setStep={setSourceStep}
        filter={libraryFilter}
        setFilter={setLibraryFilter}
        selection={mediaSelection}
        setSelection={setMediaSelection}
        onAdd={addDemoMedia}
      />
      <Dialog isOpen={previewOpen} onOpenChange={setPreviewOpen} title="Предпросмотр публикации" size="wide">
        {preview}
      </Dialog>
      <PublishDialog isOpen={publishOpen} onOpenChange={setPublishOpen} {...(id ? { postId: id } : {})} />
      <Dialog
        isOpen={leaveOpen}
        onOpenChange={setLeaveOpen}
        role="alertdialog"
        title="Выйти без сохранения?"
        description="Последние правки не сохранились. Если выйти сейчас, они пропадут."
        footer={
          <>
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <Button variant="secondary" autoFocus onPress={() => setLeaveOpen(false)}>
              Остаться и повторить
            </Button>
            <Button variant="danger" onPress={() => go('posts')}>
              Выйти без сохранения
            </Button>
          </>
        }
      />
    </div>
  );
}
