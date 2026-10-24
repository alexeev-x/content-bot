import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { createMediaThumbnail } from './media-thumbnail';

// Media bytes never change for an id, so what was downloaded once is reused until the tab forgets it: switching
// filters, tabs or dialogs shows it at once instead of downloading again. Thumbnails (≤ 480 px JPEG) are small and
// kept for a while; full originals are kept only briefly, since a page of them would weigh on a phone's memory.
const THUMBNAIL_GC_MS = 15 * 60_000;
const ORIGINAL_GC_MS = 60_000;

type Loaded = { src: string | undefined; mime: string; isError: boolean; retry: () => void };

function useBlobUrl(
  queryKey: readonly unknown[],
  load: (signal: AbortSignal) => Promise<Blob>,
  enabled: boolean,
  gcTime: number
): Loaded {
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => load(signal),
    staleTime: Infinity,
    gcTime,
    retry: false,
    enabled
  });
  const [preview, setPreview] = useState<{ blob: Blob; src: string } | null>(null);
  useEffect(() => {
    if (!query.data) return;
    const blob = query.data;
    const src = URL.createObjectURL(blob);
    let active = true;
    queueMicrotask(() => {
      if (active) setPreview({ blob, src });
    });
    return () => {
      active = false;
      URL.revokeObjectURL(src);
    };
  }, [query.data]);
  return {
    src: preview && preview.blob === query.data ? preview.src : undefined,
    mime: query.data?.type ?? '',
    isError: query.isError,
    retry: () => void query.refetch()
  };
}

/** A small cached preview of a private photo, GIF or video (first frame). */
export function useMediaThumbnail(
  mediaId: string,
  kind: 'image' | 'video',
  load: (signal: AbortSignal) => Promise<Blob>,
  enabled: boolean
): Loaded {
  return useBlobUrl(
    ['media-thumbnail', mediaId],
    async (signal) => createMediaThumbnail(await load(signal), kind, signal),
    enabled,
    THUMBNAIL_GC_MS
  );
}

/** The original bytes of a private media item, cached briefly (detail views). */
export function useMediaOriginal(
  mediaId: string,
  load: (signal: AbortSignal) => Promise<Blob>,
  enabled: boolean
): Loaded {
  return useBlobUrl(['media-original', mediaId], load, enabled, ORIGINAL_GC_MS);
}
