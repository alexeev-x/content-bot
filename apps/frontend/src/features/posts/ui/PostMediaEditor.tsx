import {
  ANIMATION_MEDIA_MAX_BYTES,
  PHOTO_MEDIA_MAX_BYTES,
  POST_MEDIA_MAX_ITEMS,
  VIDEO_MEDIA_MAX_BYTES,
  type PostMediaDto
} from '@alexeev/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import type { PostDto } from '@alexeev/contracts';
import type { PostWriteLock } from '../model/use-post-editor';
import {
  Button,
  ActionRow,
  BottomSheet,
  CropCanvas,
  Dialog,
  Dropzone,
  IconButton,
  Icon,
  MediaAddTile,
  MediaGridTile,
  Panel,
  RatioTileGroup,
  Select,
  Slider,
  Switch,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  UploadRow,
  useMediaQuery
} from '../../../shared/ui';
import {
  CROP_RATIOS,
  clampCropFrame,
  cropFrameForRatio,
  defaultCropModel,
  exportCrop,
  renderCrop,
  type CropModel,
  type CropRatio
} from '../model/crop';
import {
  attachLibraryMedia,
  cropPostMedia,
  deletePostMedia,
  getPostMediaContent,
  listMediaLibrary,
  mediaLibraryPageQueryOptions,
  postMediaContentQueryOptions,
  reorderPostMedia,
  uploadPostMedia
} from '../api/post-media-api';
import { useMediaThumbnail } from '../../../shared/lib/use-media-thumbnail';
import styles from './PostMediaEditor.module.css';

/* oxlint-disable jsx-a11y/media-has-caption -- Uploaded files may not contain captions; never fabricate a track. */
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Live status is kept on the existing generic containers for layout and semantics. */

type Entry = {
  key: string;
  media?: PostMediaDto;
  file?: File;
  previewUrl?: string;
  status: 'uploaded' | 'local' | 'uploading' | 'failed';
  rejected?: boolean;
  progress?: number;
  error?: string;
  actionError?: string;
  replaceId?: string;
  idempotencyKey?: string;
  uploadPostId?: string;
};

type Props = {
  postId: string | null;
  revision: number;
  media: PostMediaDto[];
  disabled: boolean;
  mediaWriteLock?: PostWriteLock;
  onServerChange: (revision: number, media: PostMediaDto[]) => void;
  onPendingChange: (pending: boolean) => void;
  onEnsurePost?: () => Promise<PostDto | null>;
  onDraftReady?: (post: PostDto) => void;
  onMediaSaved?: () => void;
  onRevisionConflict?: () => void;
};

const fileTypeByExtension: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4'
};
const fileType = (file: File) => {
  const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
  const expected = extension ? fileTypeByExtension[extension] : undefined;
  return expected && (!file.type || file.type === expected) ? expected : null;
};
const maxBytes = (file: File) =>
  fileType(file) === 'image/gif'
    ? ANIMATION_MEDIA_MAX_BYTES
    : fileType(file) === 'video/mp4'
      ? VIDEO_MEDIA_MAX_BYTES
      : PHOTO_MEDIA_MAX_BYTES;
const replaceAtLimitNotice =
  '\u0414\u043b\u044f \u0437\u0430\u043c\u0435\u043d\u044b \u0443\u0434\u0430\u043b\u0438\u0442\u0435 \u043e\u0434\u043d\u043e \u0432\u043b\u043e\u0436\u0435\u043d\u0438\u0435: \u043b\u0438\u043c\u0438\u0442 10 \u0444\u0430\u0439\u043b\u043e\u0432.';
const LIBRARY_WINDOW_SIZE = 30;

function formatMediaDuration(durationMs: number | null): string | undefined {
  if (durationMs === null) return undefined;
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function ServerPreview({
  media,
  large = false,
  gridTile = false,
  fluid = false,
  onOpen,
  handle,
  onRemove,
  isDisabled
}: {
  media: PostMediaDto;
  large?: boolean;
  gridTile?: boolean;
  fluid?: boolean;
  onOpen?: () => void;
  handle?: ReactNode;
  onRemove?: () => void;
  isDisabled?: boolean;
}) {
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);
  const [decodeFailed, setDecodeFailed] = useState(false);
  const query = useQuery(postMediaContentQueryOptions(media.id, media.sizeBytes));
  const error = query.error;
  const url = preview && preview.blob === query.data ? preview.url : null;
  useEffect(() => {
    if (!query.data) return;
    const blob = query.data;
    let active = true;
    let objectUrl: string | null = null;
    queueMicrotask(() => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setPreview({ blob, url: objectUrl });
      setDecodeFailed(false);
    });
    return () => {
      active = false;
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  }, [query.data]);
  const errorText =
    error instanceof ApiError && error.requestId
      ? `Предпросмотр недоступен. Запрос: ${error.requestId}`
      : error
        ? 'Предпросмотр недоступен. Вложение сохранено.'
        : null;
  if (gridTile) {
    return (
      <>
        <MediaGridTile
          fluid={fluid}
          label={media.fileName}
          src={decodeFailed ? undefined : (url ?? undefined)}
          kind={media.kind === 'video' ? 'video' : 'image'}
          duration={media.kind === 'video' ? formatMediaDuration(media.durationMs) : undefined}
          onPress={onOpen}
          handle={handle}
          onRemove={onRemove}
          removeLabel={`Убрать из поста: ${media.fileName}`}
          isDisabled={isDisabled}
        />
        {url && media.kind !== 'video' && !decodeFailed ? (
          <img
            className={styles.imageMonitor}
            src={url}
            alt={media.fileName}
            aria-hidden="true"
            onError={() => setDecodeFailed(true)}
          />
        ) : null}
        {!url && !error ? (
          <span className={styles.srOnly} role="status">
            Загружаем предпросмотр
          </span>
        ) : null}
        {errorText || decodeFailed ? (
          <div className={styles.previewError} role="status">
            <span>{errorText ?? 'Не удалось показать изображение. Вложение сохранено в посте.'}</span>
            <Button size="sm" variant="secondary" onPress={() => void query.refetch()}>
              Повторить
            </Button>
          </div>
        ) : null}
      </>
    );
  }
  if (!url || decodeFailed)
    return (
      <div className={`${styles.previewPlaceholder} ${large ? styles.largePreview : ''}`}>
        {errorText || decodeFailed ? (
          <>
            <span>{errorText ?? 'Не удалось показать изображение. Вложение сохранено в посте.'}</span>
            <Button size="sm" variant="secondary" onPress={() => void query.refetch()}>
              Повторить
            </Button>
          </>
        ) : (
          'Загружаем предпросмотр'
        )}
      </div>
    );
  return media.kind === 'video' ? (
    <video className={`${styles.preview} ${large ? styles.largePreview : ''}`} src={url} controls preload="metadata" />
  ) : (
    <img
      className={`${styles.preview} ${large ? styles.largePreview : ''}`}
      src={url}
      alt={media.fileName}
      onError={() => setDecodeFailed(true)}
    />
  );
}

const cropRatios = [
  { id: 'original', label: 'Оригинал', shape: 4 / 3 },
  { id: '1:1', label: '1:1', shape: 1 },
  { id: '4:5', label: '4:5', shape: 4 / 5 },
  { id: '16:9', label: '16:9', shape: 16 / 9 }
] as const;

function LibraryTile({
  item,
  selected,
  disabled,
  onSelectedChange
}: {
  item: Awaited<ReturnType<typeof listMediaLibrary>>['items'][number];
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

function friendlyError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 413) return 'Файл слишком большой или превышен лимит вложений.';
    if (error.status === 409) return 'Черновик изменился. Сравните его с серверной версией перед повтором действия.';
    if (error.status === 401) return 'Сессия завершилась. Войдите снова и повторите загрузку.';
    if (error.status === 403) return 'Нет доступа к этому черновику.';
  }
  return 'Не удалось загрузить файл. Проверьте соединение и повторите попытку.';
}

function libraryAttachError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Сессия завершилась. Войдите снова и повторите добавление.';
    if (error.status === 403) return 'Нет доступа к выбранному файлу или черновику.';
    if (error.status === 404) return 'Файл больше недоступен в медиатеке. Обновите список и выберите его снова.';
    if (error.status === 409)
      return 'Черновик изменился. Сначала разрешите конфликт версий, затем повторите добавление.';
    if (error.reason === 'MEDIA_LIMIT_EXCEEDED') return 'В посте уже достигнут лимит в 10 файлов.';
    if (error.reason === 'DUPLICATE_MEDIA_IDS') return 'Один из выбранных файлов уже добавлен в пост.';
    if (error.status === 429) return 'Слишком много запросов. Подождите немного и повторите добавление.';
    if (error.requestId) return `Не удалось добавить файлы. Код запроса: ${error.requestId}`;
  }
  return 'Не удалось добавить выбранные файлы. Проверьте соединение и повторите попытку.';
}

function cropErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message === 'crop-too-large')
    return 'Кадр слишком велик для загрузки. Уменьшите область кадрирования; исходное вложение сохранено.';
  if (error instanceof ApiError) {
    if (error.status === 404) return 'Фото больше недоступно. Обновите редактор и выберите вложение ещё раз.';
    if (error.status === 400)
      return 'Не удалось обработать кадрирование. Измените область и повторите попытку; исходное вложение сохранено.';
    if (error.status === 413)
      return 'Кадр слишком велик для загрузки. Уменьшите область кадрирования; исходное вложение сохранено.';
    if (error.status === 503)
      return 'Не удалось сохранить кадрирование: сервис временно недоступен. Повторите попытку позже; исходное вложение сохранено.';
    if (error.status === 409) return 'Черновик изменился. Обновите редактор перед повторным кадрированием.';
  }
  return `Не удалось применить кадрирование. Исходное вложение сохранено. ${friendlyError(error)}`;
}

export function PostMediaEditor({
  postId,
  revision,
  media,
  disabled,
  mediaWriteLock: externalMediaWriteLock,
  onServerChange,
  onPendingChange,
  onEnsurePost,
  onDraftReady,
  onMediaSaved,
  onRevisionConflict
}: Props) {
  const narrow = useMediaQuery('(max-width: 859px)');
  const [entries, setEntries] = useState<Entry[]>(() =>
    media.map((item) => ({ key: item.id, media: item, status: 'uploaded' }))
  );
  const fallbackWriteLock = useRef(false);
  const mediaWriteLock = externalMediaWriteLock ?? {
    isLocked: () => fallbackWriteLock.current,
    tryAcquire: () => {
      if (fallbackWriteLock.current) return false;
      fallbackWriteLock.current = true;
      return true;
    },
    release: () => {
      fallbackWriteLock.current = false;
    }
  };
  const revisionRef = useRef(revision);
  const mediaRef = useRef(media);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [cancelController, setCancelController] = useState<AbortController | null>(null);
  const cancelControllerRef = useRef<AbortController | null>(null);
  const cancelQueueRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const previewUrls = useRef(new Set<string>());
  const [isDropTarget, setDropTarget] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceTab, setSourceTab] = useState<'device' | 'library' | 'recent'>('device');
  const [confirmDiscardQueue, setConfirmDiscardQueue] = useState(false);
  const [libraryKind, setLibraryKind] = useState<'all' | 'photo' | 'video'>('all');
  const [libraryItems, setLibraryItems] = useState<Awaited<ReturnType<typeof listMediaLibrary>>['items']>([]);
  const [libraryCursor, setLibraryCursor] = useState<string | null>(null);
  const [librarySelection, setLibrarySelection] = useState<string[]>([]);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const [libraryErrorAction, setLibraryErrorAction] = useState<'load' | 'attach' | null>(null);
  const libraryDraftRef = useRef<PostDto | null>(null);
  const [expandedMedia, setExpandedMedia] = useState<PostMediaDto | null>(null);
  const [cropMedia, setCropMedia] = useState<PostMediaDto | null>(null);
  const [cropUrl, setCropUrl] = useState<string | null>(null);
  const [cropError, setCropError] = useState('');
  const [cropBusy, setCropBusy] = useState(false);
  const [cropModel, setCropModel] = useState<CropModel>(defaultCropModel);
  const [cropCover, setCropCover] = useState(false);
  const queryClient = useQueryClient();
  const [mobileMediaCollapsed, setMobileMediaCollapsed] = useState(false);
  const [cropNaturalSize, setCropNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const cropPreviewCanvas = useRef<HTMLCanvasElement>(null);
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [keyboardDraggedKey, setKeyboardDraggedKey] = useState<string | null>(null);
  const [keyboardTargetKey, setKeyboardTargetKey] = useState<string | null>(null);
  const [reorderAnnouncement, setReorderAnnouncement] = useState('');

  function beginWrite(): boolean {
    if (!mediaWriteLock.tryAcquire()) return false;
    onPendingChange(true);
    return true;
  }

  function endWrite(): void {
    mediaWriteLock.release();
    onPendingChange(false);
  }

  // oxlint-disable-next-line react/set-state-in-effect -- Reconcile server-confirmed media while retaining local pending uploads.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelQueueRef.current = true;
      cancelControllerRef.current?.abort();
    };
  }, []);

  useEffect(
    () => () => {
      for (const url of previewUrls.current) URL.revokeObjectURL(url);
      previewUrls.current.clear();
    },
    []
  );

  useEffect(() => {
    if (!cropMedia) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    void getPostMediaContent(cropMedia.sourceMediaId ?? cropMedia.id, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        const probe = new Image();
        probe.onload = () => setCropNaturalSize({ width: probe.naturalWidth, height: probe.naturalHeight });
        probe.src = objectUrl;
        setCropUrl(objectUrl);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setCropError(cropErrorMessage(error));
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [cropMedia]);

  useEffect(() => {
    if (!cropUrl || !cropPreviewCanvas.current) return;
    const image = new Image();
    let active = true;
    image.src = cropUrl;
    void image
      .decode()
      .then(() => {
        const canvas = cropPreviewCanvas.current;
        if (!active || !canvas) return;
        renderCrop(image, cropModel, canvas, 560);
      })
      .catch(() => {
        if (active) setCropError('Не удалось подготовить предпросмотр кадрирования.');
      });
    return () => {
      active = false;
    };
  }, [cropModel, cropUrl]);

  const selectFilesRef = useRef(selectFiles);
  useEffect(() => {
    selectFilesRef.current = selectFiles;
  });
  useEffect(() => {
    // Pasting an image anywhere on the editor page attaches it; plain-text paste is left to the editor.
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'));
      if (files.length === 0) return;
      event.preventDefault();
      void selectFilesRef.current(files);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  useEffect(() => {
    const suppressFileNavigation = (event: DragEvent) => {
      if (Array.from(event.dataTransfer?.types ?? []).includes('Files')) event.preventDefault();
    };
    window.addEventListener('dragover', suppressFileNavigation);
    window.addEventListener('drop', suppressFileNavigation);
    return () => {
      window.removeEventListener('dragover', suppressFileNavigation);
      window.removeEventListener('drop', suppressFileNavigation);
    };
  }, []);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Reconcile server-confirmed media while retaining local pending uploads.
    setEntries((current) => {
      const local = current.filter((entry) => !entry.media);
      const server = media.map((item) => ({ key: item.id, media: item, status: 'uploaded' as const }));
      return [...server, ...local];
    });
    revisionRef.current = revision;
    mediaRef.current = media;
  }, [media, revision]);

  function updateEntry(key: string, update: Partial<Entry>) {
    setEntries((current) => current.map((entry) => (entry.key === key ? { ...entry, ...update } : entry)));
  }

  function openCrop(mediaItem: PostMediaDto) {
    setCropModel(defaultCropModel());
    setCropCover(mediaItem.position === 0);
    setCropNaturalSize(
      mediaItem.width && mediaItem.height ? { width: mediaItem.width, height: mediaItem.height } : null
    );
    setCropUrl(null);
    setCropError('');
    setExpandedMedia(null);
    setCropMedia(mediaItem);
  }

  async function setCropAsCover(isSelected: boolean) {
    if (!isSelected) {
      setCropCover(false);
      return;
    }
    if (!cropMedia || cropMedia.position === 0) {
      setCropCover(true);
      return;
    }
    if (!postId || disabled || busy) return;
    const ordered = [...mediaRef.current].sort((left, right) => left.position - right.position);
    const selected = ordered.find((item) => item.id === cropMedia.id);
    if (!selected || !beginWrite()) return;
    setCropCover(true);
    setBusy(true);
    try {
      const next = [selected, ...ordered.filter((item) => item.id !== selected.id)];
      const result = await reorderPostMedia(
        postId,
        revisionRef.current,
        next.map((item) => item.id)
      );
      const updated = next.map((item, position) => ({ ...item, position }));
      setEntries((current) => [
        ...updated.map((item) => ({ key: item.id, media: item, status: 'uploaded' as const })),
        ...current.filter((item) => !item.media)
      ]);
      revisionRef.current = result.revision;
      mediaRef.current = updated;
      onServerChange(result.revision, updated);
    } catch (error) {
      setCropCover(false);
      if (error instanceof ApiError && error.status === 409) onRevisionConflict?.();
      setCropError(`Не удалось сделать фото первым в посте. ${friendlyError(error)}`);
    } finally {
      setBusy(false);
      endWrite();
    }
  }

  function rotateCrop(delta: -90 | 90) {
    const rotation = ((cropModel.rotation + delta + 360) % 360) as CropModel['rotation'];
    const natural = cropNaturalSize;
    const aspect = natural
      ? rotation % 180 === 0
        ? natural.width / natural.height
        : natural.height / natural.width
      : 4 / 3;
    setCropModel((model) => ({ ...model, rotation, frame: cropFrameForRatio(model.ratio, aspect) }));
  }

  async function upload(entry: Entry): Promise<boolean> {
    const activePostId = postId ?? entry.uploadPostId;
    if (!activePostId || !entry.file || busy) return false;
    const contentType = fileType(entry.file);
    if (!contentType) return false;
    if (!beginWrite()) return false;
    const controller = new AbortController();
    cancelControllerRef.current = controller;
    setCancelController(controller);
    setBusy(true);
    setNotice('');
    updateEntry(entry.key, { status: 'uploading', error: undefined, progress: 0 });
    try {
      const uploaded = await uploadPostMedia({
        postId: activePostId,
        revision: revisionRef.current,
        file: entry.file,
        contentType,
        signal: controller.signal,
        idempotencyKey: entry.idempotencyKey ?? crypto.randomUUID(),
        onProgress: (progress) => updateEntry(entry.key, { progress })
      });
      void queryClient.invalidateQueries({ queryKey: ['post-media', 'library'] });
      let nextRevision = uploaded.revision;
      let nextMedia = [...mediaRef.current, uploaded.media].sort((left, right) => left.position - right.position);
      onServerChange(nextRevision, nextMedia);
      revisionRef.current = nextRevision;
      mediaRef.current = nextMedia;
      if (entry.previewUrl) {
        URL.revokeObjectURL(entry.previewUrl);
        previewUrls.current.delete(entry.previewUrl);
      }
      updateEntry(entry.key, {
        media: uploaded.media,
        status: 'uploaded',
        progress: 100,
        file: undefined,
        previewUrl: undefined
      });
      if (entry.replaceId) {
        const originalPosition =
          mediaRef.current.find((item) => item.id === entry.replaceId)?.position ?? uploaded.media.position;
        const removed = await deletePostMedia(activePostId, entry.replaceId, nextRevision);
        nextRevision = removed.revision;
        nextMedia = nextMedia.filter((item) => item.id !== entry.replaceId);
        onServerChange(nextRevision, nextMedia);
        revisionRef.current = nextRevision;
        mediaRef.current = nextMedia;
        setEntries((current) => current.filter((item) => item.key !== entry.replaceId));
        const ordered = [...nextMedia].sort((left, right) => left.position - right.position);
        const newIndex = Math.min(originalPosition, ordered.length - 1);
        const replacementIndex = ordered.findIndex((item) => item.id === uploaded.media.id);
        const [replacement] = ordered.splice(replacementIndex, 1);
        if (replacement === undefined) throw new Error('Uploaded replacement is missing from the media list');
        ordered.splice(Math.max(0, newIndex), 0, replacement!);
        const reordered = await reorderPostMedia(
          activePostId,
          nextRevision,
          ordered.map((item) => item.id)
        );
        nextRevision = reordered.revision;
        nextMedia = ordered.map((item, position) => ({ ...item, position }));
        onServerChange(nextRevision, nextMedia);
        revisionRef.current = nextRevision;
        mediaRef.current = nextMedia;
      }
      return true;
    } catch (error) {
      if (controller.signal.aborted && entry.file)
        updateEntry(entry.key, {
          status: 'local',
          progress: undefined,
          error: 'Передача остановлена. Повторите загрузку — сервер вернёт тот же результат без дубликата.'
        });
      else if (entry.file) updateEntry(entry.key, { status: 'failed', error: friendlyError(error) });
      else if (!controller.signal.aborted)
        setNotice(`Файл загружен, но завершить замену не удалось. Проверьте список вложений. ${friendlyError(error)}`);
      return false;
    } finally {
      if (mounted.current) {
        setBusy(false);
        setCancelController(null);
        cancelControllerRef.current = null;
      }
      endWrite();
    }
  }

  async function selectFiles(files: FileList | File[] | null, replaceId?: string) {
    if (!files || disabled || busy) return;
    if (replaceId && entries.length >= POST_MEDIA_MAX_ITEMS) {
      setNotice(replaceAtLimitNotice);
      return;
    }
    const chosen = Array.from(files);
    const currentCount = entries.filter((entry) => !entry.rejected && (!replaceId || entry.key !== replaceId)).length;
    const typeAndSizeOk = chosen.filter(
      (file) => fileType(file) !== null && file.size > 0 && file.size <= maxBytes(file)
    );
    const accepted = typeAndSizeOk.slice(0, Math.max(0, POST_MEDIA_MAX_ITEMS - currentCount));
    if (accepted.length !== chosen.length) {
      // One notice for every kind of refusal; refused files never enter the list.
      const invalid = chosen.filter((file) => !typeAndSizeOk.includes(file)).map((file) => file.name);
      setNotice(
        [
          invalid.length > 0
            ? `Не добавлены: ${invalid.join(', ')}. Допустимы JPG, PNG, WebP (до 10 MB), GIF и MP4 (до 50 MB).`
            : '',
          typeAndSizeOk.length > accepted.length ? 'В посте может быть не больше 10 файлов.' : ''
        ]
          .filter(Boolean)
          .join(' ')
      );
    }
    const fresh = accepted.map((file): Entry => ({
      key: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'local',
      idempotencyKey: crypto.randomUUID(),
      ...(replaceId ? { replaceId } : {})
    }));
    for (const entry of fresh) if (entry.previewUrl) previewUrls.current.add(entry.previewUrl);
    if (inputRef.current) inputRef.current.value = '';
    if (fresh.length === 0) return;
    setEntries((current) => [...current, ...fresh]);
    setSourceOpen(false);
    // Uploading starts at once: choosing a file is the decision, there is no queue step.
    await uploadSelected(fresh);
  }

  async function uploadSelected(fresh?: Entry[]) {
    if (busy || disabled) return;
    // `fresh` is passed right after selection, before the state holding it has rendered.
    const queued =
      fresh ?? entries.filter((entry) => !entry.media && entry.file && !entry.rejected && entry.status !== 'uploading');
    let activePostId = postId;
    let createdPost: PostDto | null = null;
    if (!activePostId && queued.length > 0) {
      createdPost = (await onEnsurePost?.()) ?? null;
      if (!createdPost) {
        setNotice('Не удалось создать черновик. Проверьте заголовок и повторите добавление файлов.');
        return;
      }
      activePostId = createdPost.id;
      revisionRef.current = createdPost.revision;
      mediaRef.current = createdPost.media;
    }
    if (!activePostId) return;
    // Uploads are sequential because each server-confirmed upload advances the draft revision.
    cancelQueueRef.current = false;
    let allUploaded = true;
    for (const entry of queued) {
      if (cancelQueueRef.current || !mounted.current) {
        allUploaded = false;
        break;
      }
      allUploaded = (await upload({ ...entry, uploadPostId: activePostId })) && allUploaded;
    }
    if (allUploaded && queued.length > 0) setSourceOpen(false);
    if (createdPost) {
      if (allUploaded && queued.length > 0) onMediaSaved?.();
      onDraftReady?.(createdPost);
    }
  }

  async function retryQueued(entry: Entry): Promise<void> {
    const uploaded = await upload(entry);
    const otherQueuedFiles = entries.some((item) => !item.media && item.key !== entry.key);
    if (uploaded && !otherQueuedFiles) setSourceOpen(false);
  }

  async function remove(entry: Entry) {
    const activePostId = postId;
    if (disabled || busy) return;
    if (!entry.media) {
      setEntries((current) => current.filter((item) => item.key !== entry.key));
      if (entry.previewUrl) {
        URL.revokeObjectURL(entry.previewUrl);
        previewUrls.current.delete(entry.previewUrl);
      }
      return;
    }
    if (!activePostId) return;
    updateEntry(entry.key, { actionError: undefined });
    if (!beginWrite()) return;
    setBusy(true);
    try {
      const result = await deletePostMedia(activePostId, entry.media.id, revisionRef.current);
      void queryClient.invalidateQueries({ queryKey: ['post-media', 'library'] });
      const next = mediaRef.current.filter((item) => item.id !== entry.media?.id);
      setEntries((current) => current.filter((item) => item.key !== entry.key));
      revisionRef.current = result.revision;
      mediaRef.current = next;
      onServerChange(result.revision, next);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        updateEntry(entry.key, {
          actionError: 'Черновик изменился. Сравните его с серверной версией перед повторным удалением.'
        });
        onRevisionConflict?.();
      } else {
        updateEntry(entry.key, {
          actionError: `Не удалось убрать файл из поста. Повторите попытку. ${friendlyError(error)}`
        });
      }
    } finally {
      setBusy(false);
      endWrite();
    }
  }

  async function moveBefore(dragged: Entry, target: Entry) {
    if (
      !postId ||
      disabled ||
      busy ||
      dragged.status !== 'uploaded' ||
      target.status !== 'uploaded' ||
      !dragged.media ||
      !target.media
    )
      return;
    const uploaded = entries.filter((item): item is Entry & { media: PostMediaDto } => item.media !== undefined);
    const next = uploaded.filter((item) => item.key !== dragged.key);
    const draggedMedia = dragged.media;
    const targetIndex = next.findIndex((item) => item.key === target.key);
    if (targetIndex < 0 || dragged.key === target.key) return;
    next.splice(targetIndex, 0, dragged as Entry & { media: PostMediaDto });
    if (!beginWrite()) return;
    setBusy(true);
    try {
      const result = await reorderPostMedia(
        postId,
        revisionRef.current,
        next.map((item) => item.media.id)
      );
      const ordered = next.map((item, position) => ({ ...item.media, position }));
      setEntries((current) => [
        ...ordered.map((item) => ({ key: item.id, media: item, status: 'uploaded' as const })),
        ...current.filter((item) => !item.media)
      ]);
      revisionRef.current = result.revision;
      mediaRef.current = ordered;
      onServerChange(result.revision, ordered);
      setReorderAnnouncement(
        `Файл ${draggedMedia.fileName} перемещён на позицию ${ordered.findIndex((item) => item.id === draggedMedia.id) + 1}`
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) onRevisionConflict?.();
      setNotice(friendlyError(error));
    } finally {
      setBusy(false);
      endWrite();
      setDraggedKey(null);
    }
  }

  function handleReorderPress(entry: Entry) {
    if (!postId || disabled || busy || entry.status !== 'uploaded' || !entry.media) return;
    if (!keyboardDraggedKey) {
      setKeyboardDraggedKey(entry.key);
      setKeyboardTargetKey(entry.key);
      setReorderAnnouncement(`Файл ${entry.media.fileName} выбран для перестановки. Используйте стрелки`);
      return;
    }
    const source = entries.find((item) => item.key === keyboardDraggedKey);
    const target = entries.find((item) => item.key === (keyboardTargetKey ?? entry.key));
    if (source && target) void moveBefore(source, target);
    setKeyboardDraggedKey(null);
    setKeyboardTargetKey(null);
  }

  function handleReorderKeyDown(event: KeyboardEvent<HTMLElement>, entry: Entry) {
    if (!postId || disabled || busy || entry.status !== 'uploaded' || !entry.media) return;
    if (event.key === 'Escape' && keyboardDraggedKey) {
      event.preventDefault();
      setKeyboardDraggedKey(null);
      setKeyboardTargetKey(null);
      setReorderAnnouncement('Перестановка отменена');
      return;
    }
    if (keyboardDraggedKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      const uploaded = entries.filter((item) => item.media);
      const index = uploaded.findIndex((item) => item.key === (keyboardTargetKey ?? keyboardDraggedKey));
      const nextIndex = index + (event.key === 'ArrowUp' ? -1 : 1);
      const target = uploaded[nextIndex];
      if (target) {
        setKeyboardTargetKey(target.key);
        setReorderAnnouncement(`Целевая позиция ${nextIndex + 1}: ${target.media?.fileName ?? ''}`);
      }
    }
  }

  async function applyCrop() {
    if (!cropMedia || !cropUrl || !postId || busy || disabled) return;
    if (!beginWrite()) return;
    setCropBusy(true);
    setBusy(true);
    setCropError('');
    try {
      const source = new Image();
      source.src = cropUrl;
      await source.decode();
      const blob = await exportCrop(source, cropModel);
      const extension = blob.type === 'image/webp' ? '.webp' : '.jpg';
      const result = await cropPostMedia(
        postId,
        cropMedia.id,
        revisionRef.current,
        blob,
        cropMedia.fileName.replace(/\.[^.]+$/, extension),
        crypto.randomUUID()
      );
      void queryClient.invalidateQueries({ queryKey: ['post-media', 'library'] });
      const next = mediaRef.current.map((item) => (item.id === cropMedia.id ? result.media : item));
      mediaRef.current = next;
      revisionRef.current = result.revision;
      onServerChange(result.revision, next);
      setEntries((current) =>
        current.map((entry) =>
          entry.media?.id === cropMedia.id ? { key: result.media.id, media: result.media, status: 'uploaded' } : entry
        )
      );
      setCropMedia(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) onRevisionConflict?.();
      setCropError(cropErrorMessage(error));
    } finally {
      setCropBusy(false);
      setBusy(false);
      endWrite();
    }
  }

  async function openLibrary(
    kind: 'all' | 'photo' | 'video' = 'all',
    cursor?: string,
    tab: 'library' | 'recent' = sourceTab === 'recent' ? 'recent' : 'library'
  ) {
    setSourceOpen(true);
    setSourceTab(tab);
    setLibraryBusy(true);
    setLibraryError('');
    setLibraryErrorAction(null);
    try {
      const page = await queryClient.fetchQuery(mediaLibraryPageQueryOptions(kind, cursor));
      setLibraryItems((current) => {
        const combined = cursor ? [...current, ...page.items] : page.items;
        const unique = [...new Map(combined.map((item) => [item.id, item])).values()];
        if (unique.length <= LIBRARY_WINDOW_SIZE) return unique;
        const selected = new Set(librarySelection);
        const mostRecent = unique.slice(-LIBRARY_WINDOW_SIZE);
        return [
          ...new Map(
            [...unique.filter((item) => selected.has(item.id)), ...mostRecent].map((item) => [item.id, item])
          ).values()
        ];
      });
      setLibraryCursor(page.nextCursor);
      setLibraryKind(kind);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) onRevisionConflict?.();
      setLibraryError('Не удалось загрузить медиабиблиотеку. Повторите попытку.');
      setLibraryErrorAction('load');
    } finally {
      setLibraryBusy(false);
    }
  }

  async function attachSelected() {
    if (librarySelection.length === 0 || busy || libraryBusy || disabled) return;
    const available = POST_MEDIA_MAX_ITEMS - entries.filter((entry) => !entry.rejected).length;
    if (librarySelection.length > available) {
      setLibraryError(`Можно добавить ещё ${Math.max(0, available)} файлов. Уберите часть выбранных файлов.`);
      return;
    }
    let activePostId = postId ?? libraryDraftRef.current?.id ?? null;
    let createdPost: PostDto | null = null;
    if (!activePostId) {
      createdPost = (await onEnsurePost?.()) ?? null;
      if (!createdPost) {
        setLibraryError('Не удалось создать черновик. Проверьте заголовок и повторите попытку.');
        return;
      }
      activePostId = createdPost.id;
      libraryDraftRef.current = createdPost;
      revisionRef.current = createdPost.revision;
      mediaRef.current = createdPost.media;
    }
    if (!beginWrite()) return;
    setLibraryBusy(true);
    setBusy(true);
    setLibraryError('');
    setLibraryErrorAction(null);
    try {
      const result = await attachLibraryMedia(activePostId, revisionRef.current, librarySelection);
      void queryClient.invalidateQueries({ queryKey: ['post-media', 'library'] });
      revisionRef.current = result.revision;
      mediaRef.current = result.media;
      onServerChange(result.revision, result.media);
      setSourceOpen(false);
      setLibrarySelection([]);
      setLibraryErrorAction(null);
      libraryDraftRef.current = null;
      if (createdPost) {
        onMediaSaved?.();
        onDraftReady?.(createdPost);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) onRevisionConflict?.();
      setLibraryError(libraryAttachError(error));
      const canRetry =
        !(error instanceof ApiError) || error.status === 0 || error.status === 429 || error.status >= 500;
      setLibraryErrorAction(canRetry ? 'attach' : null);
    } finally {
      setLibraryBusy(false);
      setBusy(false);
      endWrite();
    }
  }

  function requestSourceClose() {
    const unfinished = entries.filter((entry) => !entry.media).length;
    if (unfinished > 0) {
      setConfirmDiscardQueue(true);
      return;
    }
    setSourceOpen(false);
  }

  function discardQueuedFiles() {
    setEntries((current) => current.filter((entry) => entry.media));
    for (const entry of entries) {
      if (!entry.media && entry.previewUrl) {
        URL.revokeObjectURL(entry.previewUrl);
        previewUrls.current.delete(entry.previewUrl);
      }
    }
    setLibrarySelection([]);
    setConfirmDiscardQueue(false);
    setSourceOpen(false);
  }

  function renderQueueRow(entry: Entry) {
    const file = entry.file;
    const state = entry.status === 'local' ? 'ready' : entry.status === 'uploading' ? 'uploading' : 'failed';
    const statusLabel = entry.rejected
      ? (entry.error ?? 'Файл не поддерживается')
      : entry.status === 'uploading'
        ? 'Загрузка…'
        : entry.status === 'failed'
          ? (entry.error ?? 'Не удалось загрузить файл')
          : 'Готов к добавлению';
    return (
      <div className={styles.queueRow} key={entry.key}>
        <UploadRow
          name={file?.name ?? 'Файл'}
          meta={file ? `${(file.size / 1_000_000).toFixed(1)} МБ` : ''}
          src={entry.previewUrl}
          kind={file?.type.startsWith('video/') ? 'video' : 'image'}
          state={state}
          progress={entry.progress}
          statusLabel={statusLabel}
          thumb="landscape"
          removeLabel={`Убрать ${file?.name ?? 'файл'}`}
          onRemove={() => void remove(entry)}
        />
        {entry.status === 'failed' && !entry.rejected ? (
          <Button variant="secondary" size="sm" isDisabled={busy || disabled} onPress={() => void retryQueued(entry)}>
            Повторить
          </Button>
        ) : null}
      </div>
    );
  }

  const queuedEntries = entries.filter((entry) => !entry.media);
  const readyQueueCount = queuedEntries.filter((entry) => !entry.rejected && entry.status !== 'uploading').length;
  const libraryPanel = (
    <div className={styles.library}>
      <Select
        label="Тип файла"
        value={libraryKind}
        options={[
          { id: 'all', label: 'Все' },
          { id: 'photo', label: 'Фото' },
          { id: 'video', label: 'Видео' }
        ]}
        onChange={(value) => {
          if (value === 'all' || value === 'photo' || value === 'video') {
            setLibraryItems([]);
            setLibraryCursor(null);
            setLibrarySelection([]);
            void openLibrary(value, undefined, sourceTab === 'recent' ? 'recent' : 'library');
          }
        }}
      />
      {libraryError ? (
        <div>
          <p className={styles.error} role="alert">
            {libraryError}
          </p>
          {libraryErrorAction ? (
            <Button
              variant="secondary"
              isDisabled={libraryBusy || disabled}
              onPress={() =>
                libraryErrorAction === 'attach'
                  ? void attachSelected()
                  : void openLibrary(libraryKind, undefined, sourceTab === 'recent' ? 'recent' : 'library')
              }
            >
              Повторить
            </Button>
          ) : null}
        </div>
      ) : null}
      {libraryBusy && libraryItems.length === 0 ? <p role="status">Загружаем медиабиблиотеку…</p> : null}
      {!libraryBusy && libraryItems.length === 0 && !libraryError ? <p>Здесь пока нет файлов.</p> : null}
      <ul className={styles.libraryGrid} aria-busy={libraryBusy} aria-label="Файлы медиабиблиотеки">
        {libraryBusy && libraryItems.length === 0
          ? Array.from({ length: 6 }, (_, index) => (
              <li key={`skeleton-${index}`} className={styles.librarySkeleton} aria-hidden="true" />
            ))
          : null}
        {libraryItems.map((item) => {
          const selected = librarySelection.includes(item.id);
          const alreadyAttached = entries.some((entry) => entry.media?.id === item.id);
          const attachedCount = entries.filter((entry) => !entry.rejected).length;
          const atLimit = attachedCount + librarySelection.length >= POST_MEDIA_MAX_ITEMS;
          return (
            <li key={item.id}>
              <LibraryTile
                item={item}
                selected={selected}
                disabled={busy || libraryBusy || disabled || alreadyAttached || (atLimit && !selected)}
                onSelectedChange={(nextSelected) =>
                  setLibrarySelection((current) =>
                    nextSelected ? [...current, item.id] : current.filter((id) => id !== item.id)
                  )
                }
              />
            </li>
          );
        })}
      </ul>
      {libraryCursor ? (
        <Button
          variant="secondary"
          isLoading={libraryBusy}
          onPress={() => void openLibrary(libraryKind, libraryCursor)}
        >
          Показать ещё
        </Button>
      ) : null}
    </div>
  );

  const hasPending = entries.some((entry) => !entry.rejected && entry.status !== 'uploaded');
  const pending = hasPending || busy;
  useEffect(() => onPendingChange(pending), [pending, onPendingChange]);
  const fileDropHandlers = {
    onDragEnter: (event: React.DragEvent<HTMLElement>) => {
      if (event.dataTransfer.types.includes('Files')) setDropTarget(true);
    },
    onDragOver: (event: React.DragEvent<HTMLElement>) => {
      if (event.dataTransfer.types.includes('Files')) {
        event.preventDefault();
        setDropTarget(true);
      }
    },
    onDragLeave: (event: React.DragEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(false);
    },
    onDrop: (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      setDropTarget(false);
      void selectFiles(event.dataTransfer.files);
    }
  };
  const sectionEntries = entries.filter((entry) => !entry.rejected && (!sourceOpen || entry.media !== undefined));
  const sectionEntryCount = entries.filter((entry) => !entry.rejected).length;
  const addTile =
    sectionEntryCount < POST_MEDIA_MAX_ITEMS ? (
      <li className={styles.addItem}>
        <MediaAddTile label="Добавить файлы" fluid isDisabled={disabled || busy} onPress={() => setSourceOpen(true)} />
      </li>
    ) : null;
  return (
    <>
      <section
        className={`${styles.section} ${isDropTarget ? styles.dropTarget : ''}`}
        data-collapsed={narrow && mobileMediaCollapsed ? '' : undefined}
        aria-labelledby="post-media-heading"
        /* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Drag-and-drop is an optional desktop enhancement; the file-picker button is the keyboard alternative. */
        {...fileDropHandlers}
      >
        <div className={styles.heading}>
          <div className={styles.headingCopy}>
            <h2 id="post-media-heading">
              <Icon name="image" size={20} />
              Фото и видео
              {sectionEntryCount > 0 ? (
                <span className={styles.mediaCount}>
                  {' '}
                  ({sectionEntryCount} {sectionEntryCount === 1 ? 'файл' : 'файлов'})
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
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4"
            multiple
            aria-hidden="true"
            tabIndex={-1}
            data-testid="media-file-input"
            onChange={(event) => {
              const replaceId = event.currentTarget.dataset.replaceId || undefined;
              delete event.currentTarget.dataset.replaceId;
              void selectFiles(event.currentTarget.files, replaceId);
            }}
          />
          <input
            ref={cameraInputRef}
            className={styles.fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4"
            capture="environment"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(event) => void selectFiles(event.currentTarget.files)}
          />
        </div>
        <div id="post-media-content" className={styles.mediaContent}>
          {sectionEntries.length ? (
            <>
              <ol className={styles.list} aria-label="Вложения поста">
                {!narrow ? addTile : null}
                {sectionEntries.map((entry) =>
                  (() => {
                    const uploadedEntries = entries.filter((item) => item.media);
                    const uploadedIndex = uploadedEntries.findIndex((item) => item.key === entry.key);
                    const mediaItem = entry.media;
                    return (
                      /* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Native draggable list item also supports the handoff's keyboard lift/move/drop model. */
                      <li
                        className={styles.item}
                        key={entry.key}
                        data-pending={!mediaItem || undefined}
                        aria-label={mediaItem ? `${mediaItem.fileName}, позиция ${uploadedIndex + 1}` : undefined}
                        data-drop-target={keyboardTargetKey === entry.key || undefined}
                        draggable={Boolean(postId && entry.status === 'uploaded' && !disabled)}
                        onKeyDown={(event) => handleReorderKeyDown(event, entry)}
                        onDragStart={() => setDraggedKey(entry.key)}
                        onDragEnd={() => setDraggedKey(null)}
                        onDragOver={(event) => {
                          if (draggedKey && draggedKey !== entry.key) event.preventDefault();
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const source = entries.find((item) => item.key === draggedKey);
                          if (source) void moveBefore(source, entry);
                        }}
                      >
                        {entry.previewUrl ? (
                          entry.file?.type.startsWith('video/') ? (
                            <video className={styles.preview} src={entry.previewUrl} controls preload="metadata" />
                          ) : (
                            <img
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
                            onOpen={() => setExpandedMedia(entry.media ?? null)}
                            onRemove={() => void remove(entry)}
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
                                  onPress={() => handleReorderPress(entry)}
                                />
                              ) : undefined
                            }
                          />
                        ) : null}
                        <div
                          className={`${styles.details} ${mediaItem && !entry.actionError ? styles.tileDetails : ''}`}
                        >
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
                            <Button
                              variant="secondary"
                              size="sm"
                              isDisabled={disabled || busy}
                              onPress={() => void remove(entry)}
                            >
                              Повторить удаление
                            </Button>
                          ) : null}
                          {entry.status === 'uploading' ? (
                            <span role="status">Загрузка: {entry.progress ?? 0}%</span>
                          ) : null}
                          {entry.status === 'failed' ? <span className={styles.error}>{entry.error}</span> : null}
                          {entry.status === 'uploaded' ? <span>Загружено на сервер</span> : null}
                          {entry.status === 'uploading' ? (
                            <progress
                              aria-label={`Загрузка ${entry.file?.name ?? ''}`}
                              max={100}
                              value={entry.progress ?? 0}
                            />
                          ) : null}
                          {entry.status === 'failed' ? (
                            <Button variant="secondary" size="sm" onPress={() => void upload(entry)}>
                              Повторить
                            </Button>
                          ) : null}
                          {entry.status === 'local' ? (
                            <Button variant="secondary" size="sm" onPress={() => void upload(entry)}>
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
                            onPress={() => void remove(entry)}
                          >
                            Убрать
                          </Button>
                        ) : null}
                      </li>
                    );
                  })()
                )}
                {narrow ? addTile : null}
              </ol>
              <span className={styles.srOnly} role="status" aria-live="polite">
                {reorderAnnouncement}
              </span>
              {sectionEntryCount >= POST_MEDIA_MAX_ITEMS ? <p className={styles.hint}>{replaceAtLimitNotice}</p> : null}
            </>
          ) : (
            <div className={styles.emptyDropzone}>
              <span className={styles.emptyDropzoneIcon} aria-hidden="true">
                <Icon name="image-plus" size={28} />
              </span>
              <strong>Добавьте фото или видео</strong>
              <span>Перетащите файлы сюда или вставьте из буфера</span>
              <Button
                variant="primary"
                size="sm"
                icon="plus"
                isDisabled={disabled || busy}
                onPress={() => setSourceOpen(true)}
              >
                Добавить медиа
              </Button>
            </div>
          )}
          {busy && cancelController ? (
            <Button
              variant="ghost"
              size="sm"
              onPress={() => {
                cancelQueueRef.current = true;
                cancelController.abort();
              }}
            >
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
      <Dialog
        isOpen={cropMedia !== null}
        onOpenChange={(open) => {
          if (!open && !cropBusy) setCropMedia(null);
        }}
        title={narrow ? 'Кадрирование' : 'Кадрирование фото'}
        size="media"
        footer={
          <>
            <Button variant="secondary" isDisabled={cropBusy} onPress={() => setCropMedia(null)}>
              Отмена
            </Button>
            <Button
              variant="secondary"
              isDisabled={cropBusy}
              onPress={() => {
                setCropModel(defaultCropModel());
              }}
            >
              Сбросить
            </Button>
            <Button
              variant="primary"
              icon="file"
              isLoading={cropBusy}
              isDisabled={!cropUrl || disabled}
              onPress={() => void applyCrop()}
            >
              Сохранить
            </Button>
          </>
        }
      >
        <span className={styles.cropDialogMarker} aria-hidden="true" />
        {narrow ? (
          <div className={styles.cropMobileHeader}>
            <Button variant="ghost" size="md" icon="chevron-left" onPress={() => setCropMedia(null)}>
              Назад
            </Button>
            <strong>Кадрирование</strong>
            <Button
              variant="primary"
              size="md"
              isLoading={cropBusy}
              isDisabled={!cropUrl || disabled || busy}
              onPress={() => void applyCrop()}
            >
              Готово
            </Button>
          </div>
        ) : null}
        {cropError ? (
          <p className={styles.error} role="alert">
            {cropError}
          </p>
        ) : null}
        {cropUrl && cropNaturalSize ? (
          <span className={styles.srOnly} role="img" aria-label="Предпросмотр кадрирования" />
        ) : null}
        <div className={styles.cropWorkspace}>
          {cropUrl && cropNaturalSize ? (
            <div className={styles.cropStage}>
              <CropCanvas
                src={cropUrl}
                imageAspect={
                  cropModel.rotation % 180 === 0
                    ? cropNaturalSize.width / cropNaturalSize.height
                    : cropNaturalSize.height / cropNaturalSize.width
                }
                frame={cropModel.frame}
                onFrameChange={(frame) =>
                  setCropModel((model) => ({ ...model, frame: clampCropFrame(frame, model.zoom) }))
                }
                lockedRatio={CROP_RATIOS[cropModel.ratio]}
                zoom={cropModel.zoom}
                rotation={cropModel.rotation}
                handle={narrow ? 'bracket' : 'square'}
                grid="dashed"
                height={narrow ? 'min(50dvh, 25rem)' : 'clamp(280px, 52vh, 420px)'}
                labels={{
                  region: 'Область кадрирования',
                  corners: {
                    'top-left': 'Левый верхний угол кадрирования',
                    'top-right': 'Правый верхний угол кадрирования',
                    'bottom-left': 'Левый нижний угол кадрирования',
                    'bottom-right': 'Правый нижний угол кадрирования'
                  }
                }}
              />
            </div>
          ) : (
            <p role="status">Загружаем оригинал фото…</p>
          )}
          {!narrow && cropUrl && cropNaturalSize ? (
            <div className={styles.cropPreviewPane}>
              <Panel title="Предпросмотр" headingLevel={3}>
                <div className={styles.cropPreviewContent}>
                  <div
                    className={styles.cropPreviewImage}
                    style={{
                      aspectRatio: String(
                        CROP_RATIOS[cropModel.ratio] ?? cropNaturalSize.width / cropNaturalSize.height
                      )
                    }}
                  >
                    <canvas ref={cropPreviewCanvas} aria-hidden="true" />
                  </div>
                  <Switch
                    isSelected={cropCover}
                    isDisabled={cropBusy || busy || disabled}
                    onChange={(selected) => void setCropAsCover(selected)}
                  >
                    Использовать как обложку
                  </Switch>
                  <p className={styles.cropPreviewHint}>Это фото будет отображаться в предпросмотре поста.</p>
                  <p className={styles.cropPreviewHint}>
                    Фото станет первым в посте. Telegram не задаёт отдельную обложку.
                  </p>
                </div>
              </Panel>
            </div>
          ) : null}
        </div>
        <RatioTileGroup
          label="Соотношение сторон"
          value={cropModel.ratio}
          options={cropRatios.map((option) => ({
            ...option,
            label: narrow && option.id === 'original' ? 'Ориг.' : option.label
          }))}
          onChange={(value) => {
            const ratio = value as CropRatio;
            const natural = cropNaturalSize;
            const aspect = natural
              ? cropModel.rotation % 180 === 0
                ? natural.width / natural.height
                : natural.height / natural.width
              : 4 / 3;
            setCropModel((model) => ({ ...model, ratio, frame: cropFrameForRatio(ratio, aspect) }));
          }}
        />
        <div className={styles.cropControlRow}>
          <Slider
            label="Масштаб"
            value={cropModel.zoom}
            onChange={(zoom) => setCropModel((model) => ({ ...model, zoom, frame: clampCropFrame(model.frame, zoom) }))}
            min={1}
            max={4}
            step={0.05}
            stepperStep={0.25}
            stepperStyle={narrow ? 'plain' : 'round'}
            pill={narrow}
            decrementLabel="Уменьшить масштаб"
            incrementLabel="Увеличить масштаб"
            valueFormat={{ style: 'percent' }}
          />
          <div className={styles.cropRotate}>
            <div className={styles.cropRotateHeading}>
              <span>Повернуть</span>
              {!narrow ? <span aria-live="polite">{cropModel.rotation}°</span> : null}
              {narrow ? (
                <Button variant="ghost" size="sm" onPress={() => setCropModel(defaultCropModel())}>
                  Сбросить
                </Button>
              ) : null}
            </div>
            <div className={styles.cropRotateButtons}>
              <IconButton
                label="Повернуть влево"
                icon="rotate-left"
                variant="secondary"
                size="target"
                isDisabled={cropBusy}
                onPress={() => rotateCrop(-90)}
              />
              <IconButton
                label="Повернуть вправо"
                icon="rotate-right"
                variant="secondary"
                size="target"
                isDisabled={cropBusy}
                onPress={() => rotateCrop(90)}
              />
            </div>
          </div>
        </div>
        {narrow ? (
          <div className={styles.cropCover}>
            <Switch
              variant="row"
              isSelected={cropCover}
              isDisabled={cropBusy || busy || disabled}
              onChange={(selected) => void setCropAsCover(selected)}
              leading={cropUrl ? <img className={styles.cropCoverThumb} src={cropUrl} alt="" /> : undefined}
              description="Эта фотография будет показываться в превью публикации."
            >
              Использовать как обложку
            </Switch>
            <p>Фото станет первым в посте. Telegram не задаёт отдельную обложку.</p>
          </div>
        ) : null}
      </Dialog>
      <Dialog
        isOpen={sourceOpen && !narrow}
        onOpenChange={(open) => (open ? setSourceOpen(true) : requestSourceClose())}
        title="Добавление медиа"
        description="Выберите файлы с устройства или из сохранённых медиа."
        size="media"
        footer={
          confirmDiscardQueue ? (
            <div className={styles.discardPrompt} role="alertdialog" aria-label="Удалить выбранные файлы?">
              <span>
                Отменить выбор {queuedEntries.length} {queuedEntries.length === 1 ? 'файла' : 'файлов'}?
              </span>
              <Button variant="secondary" onPress={() => setConfirmDiscardQueue(false)}>
                Продолжить выбор
              </Button>
              <Button variant="primary" onPress={discardQueuedFiles}>
                Отменить и удалить очередь
              </Button>
            </div>
          ) : (
            <>
              <Button variant="secondary" onPress={requestSourceClose}>
                Отмена
              </Button>
              {sourceTab === 'device' ? (
                <Button
                  variant="primary"
                  isLoading={busy}
                  isDisabled={readyQueueCount === 0 || disabled}
                  onPress={() => void uploadSelected()}
                >
                  Добавить в пост{readyQueueCount > 0 ? ` (${readyQueueCount})` : ''}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  isLoading={libraryBusy}
                  isDisabled={librarySelection.length === 0 || disabled}
                  onPress={() => void attachSelected()}
                >
                  Добавить в пост{librarySelection.length > 0 ? ` (${librarySelection.length})` : ''}
                </Button>
              )}
            </>
          )
        }
      >
        <span className={styles.sourceDialogMarker} aria-hidden="true" />
        {confirmDiscardQueue ? null : (
          <Tabs
            variant="card"
            selectedKey={sourceTab}
            onSelectionChange={(key) => {
              if (key === 'device') setSourceTab('device');
              if (key === 'library' || key === 'recent') {
                setSourceTab(key);
                if (libraryItems.length === 0 || libraryKind !== 'all') {
                  setLibraryItems([]);
                  setLibraryCursor(null);
                  setLibrarySelection([]);
                  void openLibrary('all', undefined, key);
                }
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
              <Tab id="recent" icon="clock" hint="Ранее загруженные файлы">
                Недавние
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
                  accept={['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4']}
                  onFiles={(files) => void selectFiles(files)}
                  isDisabled={busy || disabled}
                >
                  Фото — JPG, PNG, WebP до 10 МБ; GIF и видео MP4 — до 50 МБ. В посте до 10 файлов.
                </Dropzone>
                {queuedEntries.length > 0 ? (
                  <div className={styles.queue}>
                    <div className={styles.queueHeading}>
                      <strong>Выбранные файлы ({queuedEntries.length})</strong>
                      <Button
                        variant="secondary"
                        size="sm"
                        isDisabled={busy}
                        onPress={() => {
                          for (const entry of queuedEntries)
                            if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
                          setEntries((current) => current.filter((entry) => entry.media));
                        }}
                      >
                        Очистить всё
                      </Button>
                    </div>
                    {queuedEntries.map((entry) => renderQueueRow(entry))}
                    {busy && cancelController ? (
                      <Button
                        variant="secondary"
                        onPress={() => {
                          cancelQueueRef.current = true;
                          cancelController.abort();
                        }}
                      >
                        Отменить загрузку
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </TabPanel>
            <TabPanel id="library">{libraryPanel}</TabPanel>
            <TabPanel id="recent">{libraryPanel}</TabPanel>
          </Tabs>
        )}
        {notice ? (
          <p className={styles.error} role="alert">
            {notice}
          </p>
        ) : null}
        {librarySelection.length > 0 && sourceTab !== 'device' ? (
          <p className={styles.hint}>Выбрано файлов: {librarySelection.length}</p>
        ) : null}
      </Dialog>
      <BottomSheet
        isOpen={sourceOpen && narrow}
        onOpenChange={(open) => (open ? setSourceOpen(true) : requestSourceClose())}
        title="Добавить фото и видео"
        footer={
          confirmDiscardQueue ? (
            <div className={styles.discardPrompt} role="alertdialog" aria-label="Удалить выбранные файлы?">
              <span>
                Отменить выбор {queuedEntries.length} {queuedEntries.length === 1 ? 'файла' : 'файлов'}?
              </span>
              <Button variant="secondary" onPress={() => setConfirmDiscardQueue(false)}>
                Продолжить выбор
              </Button>
              <Button variant="primary" onPress={discardQueuedFiles}>
                Отменить и удалить очередь
              </Button>
            </div>
          ) : (
            <div className={styles.mobileFooter}>
              <Button variant="secondary" onPress={requestSourceClose}>
                Отмена
              </Button>
              {sourceTab === 'device' ? (
                <Button
                  variant="primary"
                  isLoading={busy}
                  isDisabled={readyQueueCount === 0 || disabled}
                  onPress={() => void uploadSelected()}
                >
                  Добавить в пост{readyQueueCount > 0 ? ` (${readyQueueCount})` : ''}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  isLoading={libraryBusy}
                  isDisabled={librarySelection.length === 0 || disabled}
                  onPress={() => void attachSelected()}
                >
                  Добавить в пост{librarySelection.length > 0 ? ` (${librarySelection.length})` : ''}
                </Button>
              )}
            </div>
          )
        }
      >
        {confirmDiscardQueue ? null : sourceTab === 'device' ? (
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
              onPress={() => void openLibrary('all', undefined, 'library')}
              isDisabled={busy || disabled}
            />
            {queuedEntries.length > 0 ? (
              <div className={styles.uploadQueue}>
                <div className={styles.queueHeading}>
                  <strong>Выбранные файлы ({queuedEntries.length})</strong>
                  <Button
                    variant="secondary"
                    size="sm"
                    isDisabled={busy}
                    onPress={() => {
                      for (const entry of queuedEntries) if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
                      setEntries((current) => current.filter((entry) => entry.media));
                    }}
                  >
                    Очистить всё
                  </Button>
                </div>
                {queuedEntries.map(renderQueueRow)}
                {busy && cancelController ? (
                  <Button
                    variant="secondary"
                    onPress={() => {
                      cancelQueueRef.current = true;
                      cancelController.abort();
                    }}
                  >
                    Отменить загрузку
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div className={styles.mobileSource}>
            <Button variant="secondary" onPress={() => setSourceTab('device')}>
              Назад к источникам
            </Button>
            {libraryPanel}
          </div>
        )}
      </BottomSheet>
      <Dialog
        isOpen={expandedMedia !== null}
        onOpenChange={(open) => {
          if (!open) setExpandedMedia(null);
        }}
        title={expandedMedia?.fileName ?? 'Предпросмотр медиа'}
        description="Полноразмерный предпросмотр вложения."
        size="wide"
        footer={
          expandedMedia ? (
            <>
              <Button variant="secondary" onPress={() => setExpandedMedia(null)}>
                Закрыть
              </Button>
              {expandedMedia.kind === 'photo' ? (
                <Button variant="secondary" isDisabled={busy || disabled} onPress={() => openCrop(expandedMedia)}>
                  Кадрировать
                </Button>
              ) : null}
              <Button
                variant="secondary"
                aria-label={`Заменить ${expandedMedia.fileName}`}
                isDisabled={busy || disabled || entries.length >= POST_MEDIA_MAX_ITEMS}
                onPress={() => {
                  if (inputRef.current) inputRef.current.dataset.replaceId = expandedMedia.id;
                  setExpandedMedia(null);
                  inputRef.current?.click();
                }}
              >
                Заменить
              </Button>
            </>
          ) : null
        }
      >
        {expandedMedia ? <ServerPreview media={expandedMedia} large /> : null}
      </Dialog>
    </>
  );
}
