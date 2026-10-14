import { POST_MEDIA_MAX_ITEMS, type PostDto } from '@alexeev/contracts';
import { useEffect, useRef, useState, type DragEvent, type RefObject } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { deletePostMedia, reorderPostMedia, uploadPostMedia } from '../api/post-media-api';
import { fileType, maxBytes, replaceAtLimitNotice, type Entry } from './media-entry';
import { friendlyError } from './media-errors';
import type { MediaState } from './use-media-state';

type Options = {
  inputRef: RefObject<HTMLInputElement | null>;
  closeSource: () => void;
};

/** Choosing a file is the decision: uploads start at once, one after another (each advances the draft revision). */
// A pasted screenshot arrives as «image.png» every time; a timestamped name keeps uploads distinguishable.
function withPastedName(file: File, index: number): File {
  if (file.name && file.name !== 'image.png' && file.name !== 'image.jpeg') return file;
  const extension = file.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return new File([file], `Вставка ${stamp}${index ? `-${index + 1}` : ''}.${extension}`, { type: file.type });
}

export function useMediaUpload(state: MediaState, { inputRef, closeSource }: Options) {
  const {
    postId,
    disabled,
    busy,
    entries,
    setEntries,
    setBusy,
    setNotice,
    updateEntry,
    beginWrite,
    endWrite,
    applyServerMedia,
    revokePreview,
    revisionRef,
    mediaRef,
    mounted,
    previewUrls,
    queryClient
  } = state;
  const [cancelController, setCancelController] = useState<AbortController | null>(null);
  const cancelControllerRef = useRef<AbortController | null>(null);
  const cancelQueueRef = useRef(false);
  const [isDropTarget, setDropTarget] = useState(false);

  useEffect(
    () => () => {
      cancelQueueRef.current = true;
      cancelControllerRef.current?.abort();
    },
    []
  );

  const selectFilesRef = useRef(selectFiles);
  useEffect(() => {
    selectFilesRef.current = selectFiles;
  });
  useEffect(() => {
    // Pasting an image or video anywhere on the editor page attaches it; plain-text paste is left to the editor.
    // Capture phase: the text editor handles paste itself and would otherwise swallow a copied picture.
    // Browsers put a copied image in `items` (kind 'file') and not always in `files`, so both are read.
    const onPaste = (event: ClipboardEvent) => {
      const data = event.clipboardData;
      if (!data) return;
      const fromItems = Array.from(data.items)
        .filter((item) => item.kind === 'file')
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);
      const files = (fromItems.length > 0 ? fromItems : Array.from(data.files)).filter(
        (file) => file.type.startsWith('image/') || file.type.startsWith('video/')
      );
      if (files.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      void selectFilesRef.current(files.map((file, index) => withPastedName(file, index)));
    };
    document.addEventListener('paste', onPaste, true);
    return () => document.removeEventListener('paste', onPaste, true);
  }, []);

  useEffect(() => {
    const suppressFileNavigation = (event: globalThis.DragEvent) => {
      if (Array.from(event.dataTransfer?.types ?? []).includes('Files')) event.preventDefault();
    };
    window.addEventListener('dragover', suppressFileNavigation);
    window.addEventListener('drop', suppressFileNavigation);
    return () => {
      window.removeEventListener('dragover', suppressFileNavigation);
      window.removeEventListener('drop', suppressFileNavigation);
    };
  }, []);

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
      applyServerMedia(nextRevision, nextMedia);
      revokePreview(entry.previewUrl);
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
        applyServerMedia(nextRevision, nextMedia);
        setEntries((current) => current.filter((item) => item.key !== entry.replaceId));
        const ordered = [...nextMedia].sort((left, right) => left.position - right.position);
        const newIndex = Math.min(originalPosition, ordered.length - 1);
        const replacementIndex = ordered.findIndex((item) => item.id === uploaded.media.id);
        const [replacement] = ordered.splice(replacementIndex, 1);
        if (replacement === undefined) throw new Error('Uploaded replacement is missing from the media list');
        ordered.splice(Math.max(0, newIndex), 0, replacement);
        const reordered = await reorderPostMedia(
          activePostId,
          nextRevision,
          ordered.map((item) => item.id)
        );
        applyServerMedia(
          reordered.revision,
          ordered.map((item, position) => ({ ...item, position }))
        );
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

  async function uploadFresh(fresh: Entry[]) {
    if (busy || disabled) return;
    let activePostId = postId;
    let createdPost: PostDto | null = null;
    if (!activePostId && fresh.length > 0) {
      createdPost = (await state.onEnsurePost?.()) ?? null;
      if (!createdPost) {
        setNotice('Не удалось создать черновик. Проверьте заголовок и повторите добавление файлов.');
        return;
      }
      activePostId = createdPost.id;
      revisionRef.current = createdPost.revision;
      mediaRef.current = createdPost.media;
    }
    if (!activePostId) return;
    cancelQueueRef.current = false;
    let allUploaded = true;
    for (const entry of fresh) {
      if (cancelQueueRef.current || !mounted.current) {
        allUploaded = false;
        break;
      }
      allUploaded = (await upload({ ...entry, uploadPostId: activePostId })) && allUploaded;
    }
    if (allUploaded && fresh.length > 0) closeSource();
    if (createdPost) {
      if (allUploaded && fresh.length > 0) state.onMediaSaved?.();
      state.onDraftReady?.(createdPost);
    }
  }

  async function selectFiles(files: FileList | File[] | null, replaceId?: string) {
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
    closeSource();
    await uploadFresh(fresh);
  }

  async function remove(entry: Entry) {
    if (disabled || busy) return;
    if (!entry.media) {
      setEntries((current) => current.filter((item) => item.key !== entry.key));
      revokePreview(entry.previewUrl);
      return;
    }
    if (!postId) return;
    updateEntry(entry.key, { actionError: undefined });
    if (!beginWrite()) return;
    setBusy(true);
    try {
      const result = await deletePostMedia(postId, entry.media.id, revisionRef.current);
      void queryClient.invalidateQueries({ queryKey: ['post-media', 'library'] });
      const next = mediaRef.current.filter((item) => item.id !== entry.media?.id);
      setEntries((current) => current.filter((item) => item.key !== entry.key));
      applyServerMedia(result.revision, next);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        updateEntry(entry.key, {
          actionError: 'Черновик изменился. Сравните его с серверной версией перед повторным удалением.'
        });
        state.onRevisionConflict?.();
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

  function cancelUpload() {
    cancelQueueRef.current = true;
    cancelController?.abort();
  }

  const fileDropHandlers = {
    onDragEnter: (event: DragEvent<HTMLElement>) => {
      if (event.dataTransfer.types.includes('Files')) setDropTarget(true);
    },
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (event.dataTransfer.types.includes('Files')) {
        event.preventDefault();
        setDropTarget(true);
      }
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(false);
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setDropTarget(false);
      void selectFiles(event.dataTransfer.files);
    }
  };

  return {
    upload,
    selectFiles,
    remove,
    cancelUpload,
    canCancel: busy && cancelController !== null,
    isDropTarget,
    fileDropHandlers
  };
}
