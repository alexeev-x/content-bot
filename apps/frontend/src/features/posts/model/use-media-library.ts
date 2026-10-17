import { POST_MEDIA_MAX_ITEMS, type PostDto } from '@alexeev/contracts';
import { useRef, useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import { attachLibraryMedia, mediaLibraryPageQueryOptions, type listMediaLibrary } from '../api/post-media-api';
import { libraryAttachError } from './media-errors';
import type { MediaState } from './use-media-state';

export type LibraryItem = Awaited<ReturnType<typeof listMediaLibrary>>['items'][number];
export type LibraryKind = 'all' | 'photo' | 'video';
export type SourceTab = 'device' | 'library';
const LIBRARY_WINDOW_SIZE = 30;

/** The «add media» dialog: which tab is open, the library listing and attaching the chosen library files. */
export function useMediaLibrary(state: MediaState) {
  const { postId, disabled, busy, entries, setBusy, beginWrite, endWrite, queryClient, revisionRef, mediaRef } = state;
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceTab, setSourceTab] = useState<SourceTab>('device');
  const [kind, setKind] = useState<LibraryKind>('all');
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [libraryBusy, setLibraryBusy] = useState(false);
  const [error, setError] = useState('');
  const [errorAction, setErrorAction] = useState<'load' | 'attach' | null>(null);
  const draftRef = useRef<PostDto | null>(null);

  async function openLibrary(nextKind: LibraryKind = 'all', nextCursor?: string) {
    setSourceOpen(true);
    setSourceTab('library');
    setLibraryBusy(true);
    setError('');
    setErrorAction(null);
    try {
      const page = await queryClient.fetchQuery(mediaLibraryPageQueryOptions(nextKind, nextCursor));
      setItems((current) => {
        const combined = nextCursor ? [...current, ...page.items] : page.items;
        const unique = [...new Map(combined.map((item) => [item.id, item])).values()];
        if (unique.length <= LIBRARY_WINDOW_SIZE) return unique;
        const selected = new Set(selection);
        const mostRecent = unique.slice(-LIBRARY_WINDOW_SIZE);
        return [
          ...new Map(
            [...unique.filter((item) => selected.has(item.id)), ...mostRecent].map((item) => [item.id, item])
          ).values()
        ];
      });
      setCursor(page.nextCursor);
      setKind(nextKind);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) state.onRevisionConflict?.();
      setError('Не удалось загрузить медиабиблиотеку. Повторите попытку.');
      setErrorAction('load');
    } finally {
      setLibraryBusy(false);
    }
  }

  function resetListing() {
    setItems([]);
    setCursor(null);
    setSelection([]);
  }

  async function attachSelected() {
    if (selection.length === 0 || busy || libraryBusy || disabled) return;
    const available = POST_MEDIA_MAX_ITEMS - entries.length;
    if (selection.length > available) {
      setError(`Можно добавить ещё ${Math.max(0, available)} файлов. Уберите часть выбранных файлов.`);
      return;
    }
    let activePostId = postId ?? draftRef.current?.id ?? null;
    let createdPost: PostDto | null = null;
    if (!activePostId) {
      createdPost = (await state.onEnsurePost?.()) ?? null;
      if (!createdPost) {
        setError('Не удалось создать черновик. Проверьте заголовок и повторите попытку.');
        return;
      }
      activePostId = createdPost.id;
      draftRef.current = createdPost;
      revisionRef.current = createdPost.revision;
      mediaRef.current = createdPost.media;
    }
    if (!beginWrite()) return;
    setLibraryBusy(true);
    setBusy(true);
    setError('');
    setErrorAction(null);
    try {
      const result = await attachLibraryMedia(activePostId, revisionRef.current, selection);
      void queryClient.invalidateQueries({ queryKey: ['post-media', 'library'] });
      state.applyServerMedia(result.revision, result.media);
      setSourceOpen(false);
      setSelection([]);
      setErrorAction(null);
      draftRef.current = null;
      if (createdPost) {
        state.onMediaSaved?.();
        state.onDraftReady?.(createdPost);
      }
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) state.onRevisionConflict?.();
      setError(libraryAttachError(caught));
      const canRetry =
        !(caught instanceof ApiError) || caught.status === 0 || caught.status === 429 || caught.status >= 500;
      setErrorAction(canRetry ? 'attach' : null);
    } finally {
      setLibraryBusy(false);
      setBusy(false);
      endWrite();
    }
  }

  return {
    sourceOpen,
    // Reopened on the library tab, the dialog re-reads the listing instead of showing the old one.
    openSource: () => {
      setSourceOpen(true);
      if (sourceTab === 'library') void openLibrary(kind);
    },
    // A selection kept from an earlier opening can outgrow the free slots (files uploaded meanwhile) and then
    // block every tile, so a closed dialog forgets it.
    closeSource: () => {
      setSourceOpen(false);
      setSelection([]);
    },
    sourceTab,
    setSourceTab,
    kind,
    items,
    cursor,
    selection,
    setSelection,
    libraryBusy,
    error,
    errorAction,
    openLibrary,
    resetListing,
    attachSelected
  };
}

export type MediaLibrary = ReturnType<typeof useMediaLibrary>;
