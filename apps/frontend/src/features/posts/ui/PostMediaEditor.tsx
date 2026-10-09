import {
  ANIMATION_MEDIA_MAX_BYTES,
  PHOTO_MEDIA_MAX_BYTES,
  POST_MEDIA_MAX_ITEMS,
  VIDEO_MEDIA_MAX_BYTES,
  type PostMediaDto
} from '@alexeev/contracts';
import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import type { PostDto } from '@alexeev/contracts';
import { Button, Dialog, Panel, Select } from '../../../shared/ui';
import {
  attachLibraryMedia,
  deletePostMedia,
  getPostMediaContent,
  listMediaLibrary,
  reorderPostMedia,
  uploadPostMedia
} from '../api/post-media-api';
import styles from './PostMediaEditor.module.css';

/* oxlint-disable jsx-a11y/media-has-caption -- Uploaded files may not contain captions; never fabricate a track. */
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- Live status is kept on the existing generic containers for layout and semantics. */

type Entry = {
  key: string;
  media?: PostMediaDto;
  file?: File;
  previewUrl?: string;
  status: 'uploaded' | 'local' | 'uploading' | 'failed';
  progress?: number;
  error?: string;
  replaceId?: string;
  idempotencyKey?: string;
  uploadPostId?: string;
};

type Props = {
  postId: string | null;
  revision: number;
  media: PostMediaDto[];
  disabled: boolean;
  onServerChange: (revision: number, media: PostMediaDto[]) => void;
  onPendingChange: (pending: boolean) => void;
  onEnsurePost?: () => Promise<PostDto | null>;
  onDraftReady?: (post: PostDto) => void;
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
const mediaRules = `До ${POST_MEDIA_MAX_ITEMS} файлов: JPG, PNG и WebP — до ${PHOTO_MEDIA_MAX_BYTES / 1_000_000} МБ каждый; GIF и MP4 — до ${ANIMATION_MEDIA_MAX_BYTES / 1_000_000} МБ каждый.`;

export function ServerPreview({ media, large = false }: { media: PostMediaDto; large?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    // oxlint-disable-next-line react/set-state-in-effect -- Start this request in its loading state, clearing any previous error.
    setError(null);
    setUrl(null);
    void getPostMediaContent(media.id, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        const requestId = cause instanceof ApiError ? cause.requestId : undefined;
        setError(
          requestId ? `Предпросмотр недоступен. Запрос: ${requestId}` : 'Предпросмотр недоступен. Вложение сохранено.'
        );
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [media.id, attempt]);
  if (!url)
    return (
      <div className={`${styles.previewPlaceholder} ${large ? styles.largePreview : ''}`}>
        {error ? (
          <>
            <span>{error}</span>
            <Button size="sm" variant="secondary" onPress={() => setAttempt((value) => value + 1)}>
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
    <img className={`${styles.preview} ${large ? styles.largePreview : ''}`} src={url} alt={media.fileName} />
  );
}

export function PostMediaPreview({ media }: { media: PostMediaDto[] }) {
  if (!media.length) return null;
  return (
    <div className={styles.previewList} aria-label="Медиа поста">
      {media.map((item) => (
        <ServerPreview key={item.id} media={item} large />
      ))}
    </div>
  );
}

function friendlyError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 413) return 'Файл слишком большой или превышен лимит вложений.';
    if (error.status === 409) return 'Черновик изменился. Обновите страницу: файл не добавлен.';
    if (error.status === 401) return 'Сессия завершилась. Войдите снова и повторите загрузку.';
    if (error.status === 403) return 'Нет доступа к этому черновику.';
  }
  return 'Не удалось загрузить файл. Проверьте соединение и повторите попытку.';
}

export function PostMediaEditor({
  postId,
  revision,
  media,
  disabled,
  onServerChange,
  onPendingChange,
  onEnsurePost,
  onDraftReady
}: Props) {
  const [entries, setEntries] = useState<Entry[]>(() =>
    media.map((item) => ({ key: item.id, media: item, status: 'uploaded' }))
  );
  const revisionRef = useRef(revision);
  const mediaRef = useRef(media);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [cancelController, setCancelController] = useState<AbortController | null>(null);
  const cancelControllerRef = useRef<AbortController | null>(null);
  const cancelQueueRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const previewUrls = useRef(new Set<string>());
  const [isDropTarget, setDropTarget] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryKind, setLibraryKind] = useState<'all' | 'photo' | 'video'>('all');
  const [libraryItems, setLibraryItems] = useState<Awaited<ReturnType<typeof listMediaLibrary>>['items']>([]);
  const [libraryCursor, setLibraryCursor] = useState<string | null>(null);
  const [librarySelection, setLibrarySelection] = useState<string[]>([]);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const [expandedMedia, setExpandedMedia] = useState<PostMediaDto | null>(null);
  const [draggedKey, setDraggedKey] = useState<string | null>(null);

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

  async function upload(entry: Entry): Promise<boolean> {
    const activePostId = postId ?? entry.uploadPostId;
    if (!activePostId || !entry.file || busy) return false;
    const contentType = fileType(entry.file);
    if (!contentType) return false;
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
    }
  }

  async function selectFiles(files: FileList | null, replaceId?: string) {
    if (!files || disabled || busy) return;
    if (replaceId && entries.length >= POST_MEDIA_MAX_ITEMS) {
      setNotice(replaceAtLimitNotice);
      return;
    }
    const chosen = Array.from(files);
    const currentCount = entries.filter((entry) => !replaceId || entry.key !== replaceId).length;
    const typeAndSizeOk = chosen.filter(
      (file) => fileType(file) !== null && file.size > 0 && file.size <= maxBytes(file)
    );
    const accepted = typeAndSizeOk.slice(0, Math.max(0, POST_MEDIA_MAX_ITEMS - currentCount));
    if (accepted.length !== chosen.length)
      setNotice('Можно добавить не более 10 фото, GIF или видео. Поддерживаются только файлы изображений и видео.');
    if (typeAndSizeOk.length !== chosen.length) {
      const invalid = chosen
        .filter((file) => !typeAndSizeOk.includes(file))
        .map((file) => file.name)
        .join(', ');
      setNotice(`Не добавлены: ${invalid}. Допустимы JPG, PNG, WebP (до 10 MB), GIF и MP4 (до 50 MB).`);
    }
    let activePostId = postId;
    let createdPost: PostDto | null = null;
    if (!activePostId && accepted.length > 0) {
      const post = await onEnsurePost?.();
      if (!post) {
        setNotice('Не удалось создать черновик. Проверьте заголовок и повторите добавление файлов.');
        return;
      }
      activePostId = post.id;
      revisionRef.current = post.revision;
      mediaRef.current = post.media;
      createdPost = post;
    }
    if (!activePostId) return;
    const fresh = accepted.map((file): Entry => ({
      key: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: 'local',
      idempotencyKey: crypto.randomUUID(),
      ...(postId ? {} : { uploadPostId: activePostId }),
      ...(replaceId ? { replaceId } : {})
    }));
    for (const entry of fresh) if (entry.previewUrl) previewUrls.current.add(entry.previewUrl);
    setEntries((current) => [...current, ...fresh]);
    if (inputRef.current) inputRef.current.value = '';
    // Uploads are sequential because each server-confirmed upload advances the draft revision.
    cancelQueueRef.current = false;
    for (const entry of fresh) {
      if (cancelQueueRef.current || !mounted.current) break;
      await upload(entry);
    }
    if (createdPost) onDraftReady?.(createdPost);
  }

  async function remove(entry: Entry) {
    const activePostId = postId;
    if (!activePostId || disabled || busy) return;
    if (!entry.media) {
      setEntries((current) => current.filter((item) => item.key !== entry.key));
      if (entry.previewUrl) {
        URL.revokeObjectURL(entry.previewUrl);
        previewUrls.current.delete(entry.previewUrl);
      }
      return;
    }
    setBusy(true);
    try {
      const result = await deletePostMedia(activePostId, entry.media.id, revisionRef.current);
      const next = mediaRef.current.filter((item) => item.id !== entry.media?.id);
      setEntries((current) => current.filter((item) => item.key !== entry.key));
      revisionRef.current = result.revision;
      mediaRef.current = next;
      onServerChange(result.revision, next);
    } catch (error) {
      setNotice(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  async function move(entry: Entry, direction: -1 | 1) {
    if (!postId || disabled || busy || entry.status !== 'uploaded') return;
    const uploaded = entries.filter((item): item is Entry & { media: PostMediaDto } => item.media !== undefined);
    const index = uploaded.findIndex((item) => item.key === entry.key);
    const target = index + direction;
    if (target < 0 || target >= uploaded.length) return;
    const next = [...uploaded];
    [next[index], next[target]] = [next[target]!, next[index]!];
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
    } catch (error) {
      setNotice(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  async function moveBefore(dragged: Entry, target: Entry) {
    if (!postId || disabled || busy || dragged.status !== 'uploaded' || target.status !== 'uploaded') return;
    const uploaded = entries.filter((item): item is Entry & { media: PostMediaDto } => item.media !== undefined);
    const next = uploaded.filter((item) => item.key !== dragged.key);
    const targetIndex = next.findIndex((item) => item.key === target.key);
    if (targetIndex < 0) return;
    next.splice(targetIndex, 0, dragged as Entry & { media: PostMediaDto });
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
    } catch (error) {
      setNotice(friendlyError(error));
    } finally {
      setBusy(false);
      setDraggedKey(null);
    }
  }

  async function openLibrary(kind: 'all' | 'photo' | 'video' = 'all', cursor?: string) {
    setLibraryOpen(true);
    setLibraryBusy(true);
    setLibraryError('');
    try {
      const page = await listMediaLibrary(kind, cursor);
      setLibraryItems((current) => (cursor ? [...current, ...page.items] : page.items));
      setLibraryCursor(page.nextCursor);
      setLibraryKind(kind);
    } catch {
      setLibraryError('Не удалось загрузить медиабиблиотеку. Повторите попытку.');
    } finally {
      setLibraryBusy(false);
    }
  }

  async function attachSelected() {
    if (librarySelection.length === 0 || busy || libraryBusy || disabled) return;
    let activePostId = postId;
    let createdPost: PostDto | null = null;
    if (!activePostId) {
      createdPost = (await onEnsurePost?.()) ?? null;
      if (!createdPost) {
        setLibraryError('Не удалось создать черновик. Проверьте заголовок и повторите попытку.');
        return;
      }
      activePostId = createdPost.id;
      revisionRef.current = createdPost.revision;
      mediaRef.current = createdPost.media;
    }
    setLibraryBusy(true);
    setLibraryError('');
    try {
      const result = await attachLibraryMedia(activePostId, revisionRef.current, librarySelection);
      revisionRef.current = result.revision;
      mediaRef.current = result.media;
      onServerChange(result.revision, result.media);
      setLibraryOpen(false);
      setLibrarySelection([]);
      if (createdPost) onDraftReady?.(createdPost);
    } catch {
      setLibraryError('Не удалось добавить выбранные файлы. Повторите попытку.');
    } finally {
      setLibraryBusy(false);
    }
  }

  const hasPending = entries.some((entry) => entry.status !== 'uploaded');
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
  return (
    <Panel>
      <section
        className={`${styles.section} ${isDropTarget ? styles.dropTarget : ''}`}
        aria-labelledby="post-media-heading"
        /* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Drag-and-drop is an optional desktop enhancement; the file-picker button is the keyboard alternative. */
        {...fileDropHandlers}
      >
        <div className={styles.heading}>
          <div className={styles.headingCopy}>
            <h2 id="post-media-heading">Фото и видео</h2>
            {postId ? <p>{mediaRules}</p> : null}
          </div>
          <Button
            variant={entries.length === 0 ? 'primary' : 'secondary'}
            icon="plus"
            isDisabled={disabled || busy || entries.length >= POST_MEDIA_MAX_ITEMS}
            className={isDropTarget ? styles.dropTarget : undefined}
            onPress={() => setSourceOpen(true)}
          >
            {entries.length === 0 ? 'Выбрать файлы' : 'Добавить файлы'}
          </Button>
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
        </div>
        {!postId && entries.length === 0 ? (
          <div className={styles.dropHint}>
            <strong>Перетащите файлы сюда или выберите источник</strong>
            <span>Черновик создастся автоматически при первом добавлении медиа.</span>
          </div>
        ) : null}
        {entries.length ? (
          <>
            <ol className={styles.list} aria-label="Вложения поста">
              {entries.map((entry) =>
                (() => {
                  const uploadedEntries = entries.filter((item) => item.media);
                  const uploadedIndex = uploadedEntries.findIndex((item) => item.key === entry.key);
                  return (
                    /* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Native draggable list item is the desktop reorder target; adjacent move-up/down buttons are keyboard alternatives. */
                    <li
                      className={styles.item}
                      key={entry.key}
                      draggable={Boolean(postId && entry.status === 'uploaded' && !disabled)}
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
                        <ServerPreview media={entry.media} />
                      ) : null}
                      <div className={styles.details}>
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
                      {entry.media ? (
                        <div className={styles.controls}>
                          <Button variant="ghost" size="sm" onPress={() => setExpandedMedia(entry.media ?? null)}>
                            Увеличить
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Заменить ${entry.media.fileName}`}
                            isDisabled={busy || disabled || entries.length >= POST_MEDIA_MAX_ITEMS}
                            onPress={() => {
                              if (inputRef.current) {
                                inputRef.current.dataset.replaceId = entry.media?.id ?? '';
                                inputRef.current.click();
                              }
                            }}
                          >
                            Заменить
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Переместить ${entry.media.fileName} выше`}
                            isDisabled={busy || disabled || uploadedIndex === 0}
                            onPress={() => void move(entry, -1)}
                          >
                            Выше
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Переместить ${entry.media.fileName} ниже`}
                            isDisabled={busy || disabled || uploadedIndex === uploadedEntries.length - 1}
                            onPress={() => void move(entry, 1)}
                          >
                            Ниже
                          </Button>
                        </div>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Убрать ${entry.file?.name ?? entry.media?.fileName ?? 'файл'}`}
                        isDisabled={busy || disabled}
                        onPress={() => void remove(entry)}
                      >
                        Убрать
                      </Button>
                    </li>
                  );
                })()
              )}
            </ol>
            {entries.length >= POST_MEDIA_MAX_ITEMS ? <p className={styles.hint}>{replaceAtLimitNotice}</p> : null}
          </>
        ) : (
          <p className={styles.hint}>
            После выбора файлы появятся здесь. Они попадут в черновик только после подтверждения загрузки.
          </p>
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
      </section>
      <Dialog
        isOpen={sourceOpen}
        onOpenChange={setSourceOpen}
        title="Добавить медиа"
        description="Выберите, откуда добавить фотографии или видео."
        footer={
          <Button variant="secondary" onPress={() => setSourceOpen(false)}>
            Отмена
          </Button>
        }
      >
        <div className={styles.sourceSheet}>
          <Button
            variant="primary"
            onPress={() => {
              setSourceOpen(false);
              inputRef.current?.click();
            }}
          >
            Выбрать с устройства
          </Button>
          <Button
            variant="secondary"
            onPress={() => {
              setSourceOpen(false);
              void openLibrary();
            }}
          >
            Открыть медиабиблиотеку
          </Button>
        </div>
      </Dialog>
      <Dialog
        isOpen={expandedMedia !== null}
        onOpenChange={(open) => {
          if (!open) setExpandedMedia(null);
        }}
        title={expandedMedia?.fileName ?? 'Предпросмотр медиа'}
        description="Полноразмерный предпросмотр вложения."
        size="wide"
      >
        {expandedMedia ? <ServerPreview media={expandedMedia} large /> : null}
      </Dialog>
      <Dialog
        isOpen={libraryOpen}
        onOpenChange={setLibraryOpen}
        title="Медиабиблиотека"
        description="Выберите один или несколько файлов, чтобы добавить их в публикацию без повторной загрузки."
        size="wide"
        footer={
          <>
            <Button variant="secondary" onPress={() => setLibraryOpen(false)}>
              Отмена
            </Button>
            <Button
              variant="primary"
              isLoading={libraryBusy}
              isDisabled={librarySelection.length === 0}
              onPress={() => void attachSelected()}
            >
              Добавить выбранные ({librarySelection.length})
            </Button>
          </>
        }
      >
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
                void openLibrary(value);
              }
            }}
          />
          {libraryError ? (
            <div>
              <p className={styles.error} role="alert">
                {libraryError}
              </p>
              <Button variant="secondary" onPress={() => void openLibrary(libraryKind)}>
                Повторить
              </Button>
            </div>
          ) : null}
          {libraryBusy && libraryItems.length === 0 ? <p role="status">Загружаем медиабиблиотеку…</p> : null}
          {!libraryBusy && libraryItems.length === 0 && !libraryError ? (
            <p>В медиабиблиотеке пока нет файлов.</p>
          ) : null}
          <ul className={styles.libraryList}>
            {libraryItems.map((item) => (
              <li key={item.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={librarySelection.includes(item.id)}
                    onChange={(event) =>
                      setLibrarySelection((current) =>
                        event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id)
                      )
                    }
                  />
                  <span>
                    {item.kind === 'video' ? 'Видео' : item.kind === 'animation' ? 'GIF' : 'Фото'} · {item.fileName}
                  </span>
                </label>
              </li>
            ))}
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
      </Dialog>
    </Panel>
  );
}
