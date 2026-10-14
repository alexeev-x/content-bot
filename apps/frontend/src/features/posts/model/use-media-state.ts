import type { PostDto, PostMediaDto } from '@alexeev/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { Entry } from './media-entry';
import type { PostWriteLock } from './use-post-editor';

export type MediaEditorProps = {
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

/**
 * State shared by the upload, library, crop and reorder hooks: the entry list, the write lock and the latest
 * server-confirmed revision/media (refs, so a chain of writes always sends the revision the previous one returned).
 */
export function useMediaState({
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
}: MediaEditorProps) {
  const queryClient = useQueryClient();
  const [entries, setEntries] = useState<Entry[]>(() =>
    media.map((item) => ({ key: item.id, media: item, status: 'uploaded' }))
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const fallbackWriteLock = useRef(false);
  const revisionRef = useRef(revision);
  const mediaRef = useRef(media);
  const mounted = useRef(true);
  const previewUrls = useRef(new Set<string>());
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

  function beginWrite(): boolean {
    if (!mediaWriteLock.tryAcquire()) return false;
    onPendingChange(true);
    return true;
  }

  function endWrite(): void {
    mediaWriteLock.release();
    onPendingChange(false);
  }

  function updateEntry(key: string, update: Partial<Entry>) {
    setEntries((current) => current.map((entry) => (entry.key === key ? { ...entry, ...update } : entry)));
  }

  /** Records a server-confirmed state: the next write must carry this revision. */
  function applyServerMedia(nextRevision: number, nextMedia: PostMediaDto[]) {
    revisionRef.current = nextRevision;
    mediaRef.current = nextMedia;
    onServerChange(nextRevision, nextMedia);
  }

  function revokePreview(url: string | undefined) {
    if (!url) return;
    URL.revokeObjectURL(url);
    previewUrls.current.delete(url);
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
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
    // oxlint-disable-next-line react/set-state-in-effect -- Reconcile server-confirmed media while retaining local pending uploads.
    setEntries((current) => {
      const local = current.filter((entry) => !entry.media);
      const server = media.map((item) => ({ key: item.id, media: item, status: 'uploaded' as const }));
      return [...server, ...local];
    });
    revisionRef.current = revision;
    mediaRef.current = media;
  }, [media, revision]);

  const hasPending = entries.some((entry) => entry.status !== 'uploaded');
  const pending = hasPending || busy;
  useEffect(() => onPendingChange(pending), [pending, onPendingChange]);

  return {
    postId,
    disabled,
    entries,
    setEntries,
    busy,
    setBusy,
    pending,
    notice,
    setNotice,
    queryClient,
    revisionRef,
    mediaRef,
    mounted,
    previewUrls,
    beginWrite,
    endWrite,
    updateEntry,
    applyServerMedia,
    revokePreview,
    onEnsurePost,
    onDraftReady,
    onMediaSaved,
    onRevisionConflict
  };
}

export type MediaState = ReturnType<typeof useMediaState>;
