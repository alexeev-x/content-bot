import { cleanup, fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../shared/api/http-client';
import { clearSession, setSession } from '../../../shared/api/session';
import { accessToken, ids, post } from '../../../test/fixtures';
import { createTestQueryClient } from '../../../test/query-wrapper';
import type { MediaLibraryItemDto } from '@alexeev/contracts';
import {
  attachLibraryMedia,
  deletePostMedia,
  cropPostMedia,
  getPostMediaContent,
  listMediaLibrary,
  reorderPostMedia,
  uploadPostMedia
} from '../api/post-media-api';
import { PostMediaEditor, ServerPreview } from '../ui/PostMediaEditor';

vi.mock('../api/post-media-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/post-media-api')>();
  const getContent = vi.fn();
  const listLibrary = vi.fn();
  return {
    ...actual,
    deletePostMedia: vi.fn(),
    attachLibraryMedia: vi.fn(),
    cropPostMedia: vi.fn(),
    getPostMediaContent: getContent,
    listMediaLibrary: listLibrary,
    mediaLibraryPageQueryOptions: (kind: 'all' | 'photo' | 'video', cursor?: string) => ({
      queryKey: ['post-media', 'library', kind, cursor ?? null] as const,
      queryFn: () => listLibrary(kind, cursor),
      staleTime: 30_000,
      gcTime: 60_000,
      retry: false
    }),
    postMediaContentQueryOptions: (mediaId: string, sizeBytes: number, options: { cachePreview?: boolean } = {}) => {
      const cacheable = options.cachePreview !== false && sizeBytes <= 512_000;
      return {
        queryKey: ['post-media', 'content', mediaId] as const,
        queryFn: ({ signal }: { signal: AbortSignal }) => getContent(mediaId, signal),
        staleTime: cacheable ? 60_000 : 0,
        gcTime: cacheable ? 60_000 : 0,
        retry: false
      };
    },
    reorderPostMedia: vi.fn(),
    uploadPostMedia: vi.fn()
  };
});

function render(ui: ReactElement, client: QueryClient = createTestQueryClient()) {
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
beforeEach(() => {
  clearSession();
  setSession(accessToken());
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:local-preview') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.mocked(uploadPostMedia).mockReset();
  vi.mocked(deletePostMedia).mockReset();
  vi.mocked(attachLibraryMedia).mockReset();
  vi.mocked(cropPostMedia).mockReset();
  vi.mocked(reorderPostMedia).mockReset();
  vi.mocked(listMediaLibrary).mockReset();
  vi.mocked(getPostMediaContent)
    .mockReset()
    .mockResolvedValue(new Blob(['private media'], { type: 'image/png' }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('post media editor', () => {
  it('uses a temporary private-media object URL and revokes it on unmount', async () => {
    const media = {
      id: ids.post,
      sourceMediaId: null,
      kind: 'photo' as const,
      fileName: 'private.png',
      contentType: 'image/png',
      sizeBytes: 5,
      width: 1,
      height: 1,
      durationMs: null,
      position: 0
    };
    const { unmount } = render(<ServerPreview media={media} />);
    await screen.findByRole('img', { name: 'private.png' });
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-preview');
  });

  it('reuses a small private preview from the in-memory cache when reopened', async () => {
    const media = {
      id: ids.post,
      sourceMediaId: null,
      kind: 'photo' as const,
      fileName: 'cached.png',
      contentType: 'image/png',
      sizeBytes: 5,
      width: 1,
      height: 1,
      durationMs: null,
      position: 0
    };
    const client = createTestQueryClient();
    const first = render(<ServerPreview media={media} />, client);
    await screen.findByRole('img', { name: 'cached.png' });
    first.unmount();

    render(<ServerPreview media={media} />, client);
    await screen.findByRole('img', { name: 'cached.png' });

    expect(getPostMediaContent).toHaveBeenCalledTimes(1);
  });

  it('does not start a media mutation while another post revision write holds the lock', async () => {
    const media = {
      id: ids.post,
      sourceMediaId: null,
      kind: 'photo' as const,
      fileName: 'locked.png',
      contentType: 'image/png',
      sizeBytes: 5,
      width: 1,
      height: 1,
      durationMs: null,
      position: 0
    };
    let locked = true;
    const mediaWriteLock = {
      isLocked: () => locked,
      tryAcquire: () => {
        if (locked) return false;
        locked = true;
        return true;
      },
      release: () => {
        locked = false;
      }
    };
    const user = userEvent.setup();
    render(
      <PostMediaEditor
        postId={ids.post}
        revision={1}
        media={[media]}
        disabled={false}
        mediaWriteLock={mediaWriteLock}
        onServerChange={vi.fn()}
        onPendingChange={vi.fn()}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Убрать из поста: locked.png' }));
    expect(deletePostMedia).not.toHaveBeenCalled();
    locked = false;
    vi.mocked(deletePostMedia).mockResolvedValue({ revision: 2 });
    await user.click(screen.getByRole('button', { name: 'Убрать из поста: locked.png' }));
    await waitFor(() => expect(deletePostMedia).toHaveBeenCalledWith(ids.post, media.id, 1));
  });

  it('keeps media-library errors visible and retryable in the source dialog', async () => {
    vi.mocked(listMediaLibrary).mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    render(
      <PostMediaEditor
        postId={ids.post}
        revision={0}
        media={[]}
        disabled={false}
        onServerChange={vi.fn()}
        onPendingChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Добавить медиа' }));
    await user.click(await screen.findByRole('tab', { name: /Медиабиблиотека/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('Не удалось загрузить медиабиблиотеку');
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    await waitFor(() => expect(listMediaLibrary).toHaveBeenCalledTimes(2));
  });

  it('retries attaching the selected library asset instead of reloading the library', async () => {
    const libraryAsset: MediaLibraryItemDto = {
      id: '10000000-0000-4000-8000-000000000099',
      kind: 'photo',
      fileName: 'saved.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 100_000,
      width: 1200,
      height: 800,
      durationMs: null,
      createdAt: '2026-10-10T12:00:00.000Z'
    };
    vi.mocked(listMediaLibrary).mockResolvedValue({ items: [libraryAsset], nextCursor: null });
    vi.mocked(attachLibraryMedia)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ revision: 1, media: [] });
    const user = userEvent.setup();
    const onServerChange = vi.fn();
    render(
      <PostMediaEditor
        postId={ids.post}
        revision={0}
        media={[]}
        disabled={false}
        onServerChange={onServerChange}
        onPendingChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /Добавить медиа/ }));
    await user.click(await screen.findByRole('tab', { name: /Медиабиблиотека/ }));
    await user.click(await screen.findByRole('button', { name: 'saved.jpg' }));
    await user.click(screen.getByRole('button', { name: /Добавить в пост/ }));
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Повторить' }));

    await waitFor(() => expect(attachLibraryMedia).toHaveBeenCalledTimes(2));
    expect(attachLibraryMedia).toHaveBeenLastCalledWith(ids.post, 0, [libraryAsset.id]);
    expect(onServerChange).toHaveBeenCalledWith(1, []);
  });

  it('bounds loaded library previews while keeping selected older media available', async () => {
    const pageSize = 30;
    const makeItem = (index: number): MediaLibraryItemDto => ({
      id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      kind: 'photo',
      fileName: `asset-${String(index).padStart(3, '0')}.jpg`,
      contentType: 'image/jpeg',
      sizeBytes: index % 10 === 0 ? 1_000_000 : 200_000,
      width: 1200,
      height: 900,
      durationMs: null,
      createdAt: '2026-10-10T12:00:00.000Z'
    });
    vi.mocked(listMediaLibrary).mockImplementation(async (_kind, cursor) => {
      const offset = cursor ? Number(cursor) : 0;
      const items = Array.from({ length: pageSize }, (_, index) => makeItem(offset + index));
      const nextOffset = offset + pageSize;
      return { items, nextCursor: nextOffset < 90 ? String(nextOffset) : null };
    });
    const user = userEvent.setup();
    const client = createTestQueryClient();
    render(
      <PostMediaEditor
        postId={ids.post}
        revision={0}
        media={[]}
        disabled={false}
        onServerChange={vi.fn()}
        onPendingChange={vi.fn()}
      />,
      client
    );

    await user.click(screen.getByRole('button', { name: /Добавить медиа/ }));
    await user.click(await screen.findByRole('tab', { name: /Медиабиблиотека/ }));
    await screen.findByRole('button', { name: 'asset-000.jpg' });
    await user.click(screen.getByRole('button', { name: 'asset-000.jpg' }));
    await user.click(screen.getByRole('button', { name: 'Показать ещё' }));
    await screen.findByRole('button', { name: 'asset-059.jpg' });
    await user.click(screen.getByRole('button', { name: 'Показать ещё' }));
    await screen.findByRole('button', { name: 'asset-089.jpg' });

    const library = screen.getByRole('list', { name: /Файлы медиабиблиотеки/ });
    expect(within(library).getAllByRole('listitem')).toHaveLength(pageSize + 1);
    expect(screen.getByRole('button', { name: 'asset-000.jpg' })).toBeTruthy();
    await waitFor(() =>
      expect(
        client
          .getQueryCache()
          .findAll({ queryKey: ['post-media', 'content'] })
          .filter((query) => query.state.data instanceof Blob)
      ).toHaveLength(27)
    );
  });

  it('keeps the compact empty-media state while retaining supported file types', () => {
    render(
      <PostMediaEditor
        postId={ids.post}
        revision={0}
        media={[]}
        disabled={false}
        onServerChange={vi.fn()}
        onPendingChange={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Добавить медиа' })).toBeTruthy();
    expect(screen.getByTestId('media-file-input').getAttribute('accept')).toBe(
      'image/jpeg,image/png,image/webp,image/gif,video/mp4'
    );
    expect(screen.queryByText(/До 10 файлов:/)).toBeNull();
  });

  it('opens a full-size preview for an attached media item', async () => {
    const media = {
      id: ids.post,
      kind: 'photo' as const,
      sourceMediaId: null,
      fileName: 'cover.png',
      contentType: 'image/png',
      sizeBytes: 5,
      width: 1,
      height: 1,
      durationMs: null,
      position: 0
    };
    const user = userEvent.setup();
    render(
      <PostMediaEditor
        postId={ids.post}
        revision={1}
        media={[media]}
        disabled={false}
        onServerChange={vi.fn()}
        onPendingChange={vi.fn()}
      />
    );
    const preview = screen.getByRole('button', { name: 'cover.png' });
    preview.focus();
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: 'cover.png' });
    expect(within(dialog).getByRole('button', { name: 'Кадрировать' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Заменить cover.png' })).toBeTruthy();
    await waitFor(() => expect(getPostMediaContent).toHaveBeenCalledWith(media.id, expect.any(AbortSignal)));
  });

  it('persists desktop drag-and-drop media reorder through the server API', async () => {
    const first = {
      id: ids.post,
      kind: 'photo' as const,
      sourceMediaId: null,
      fileName: 'first.png',
      contentType: 'image/png',
      sizeBytes: 5,
      width: 1,
      height: 1,
      durationMs: null,
      position: 0
    };
    const second = { ...first, id: ids.post2, fileName: 'second.png', position: 1 };
    vi.mocked(reorderPostMedia).mockResolvedValue({ revision: 2 });
    render(
      <PostMediaEditor
        postId={ids.post}
        revision={1}
        media={[first, second]}
        disabled={false}
        onServerChange={vi.fn()}
        onPendingChange={vi.fn()}
      />
    );
    const items = screen.getByRole('list', { name: 'Вложения поста' }).querySelectorAll('li[aria-label]');
    const firstItem = items.item(0);
    const secondItem = items.item(1);
    if (!firstItem || !secondItem) throw new Error('Expected two media list items');
    fireEvent.dragStart(secondItem, { dataTransfer: { types: ['application/x-post-media'], setData: vi.fn() } });
    fireEvent.dragOver(firstItem, { dataTransfer: { types: ['application/x-post-media'] } });
    fireEvent.drop(firstItem, { dataTransfer: { types: ['application/x-post-media'], files: [] } });
    await waitFor(() => expect(reorderPostMedia).toHaveBeenCalledWith(ids.post, 1, [second.id, first.id]));
  });

  it('keeps reorder keyboard-accessible without visible move buttons and writes only on drop', async () => {
    const first = {
      id: ids.post,
      kind: 'photo' as const,
      sourceMediaId: null,
      fileName: 'first.png',
      contentType: 'image/png',
      sizeBytes: 5,
      width: 1,
      height: 1,
      durationMs: null,
      position: 0
    };
    const second = { ...first, id: ids.post2, fileName: 'second.png', position: 1 };
    vi.mocked(reorderPostMedia).mockResolvedValue({ revision: 2 });
    render(
      <PostMediaEditor
        postId={ids.post}
        revision={1}
        media={[first, second]}
        disabled={false}
        onServerChange={vi.fn()}
        onPendingChange={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: /переместить .* выше|переместить .* ниже/i })).toBeNull();
    const dragHandle = screen.getByRole('button', { name: 'Переставить second.png' });
    dragHandle.focus();
    const user = userEvent.setup();
    await user.keyboard(' ');
    await user.keyboard('{ArrowUp}');
    expect(reorderPostMedia).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(screen.getByText('Перестановка отменена')).toBeTruthy();
    expect(reorderPostMedia).not.toHaveBeenCalled();
    await user.keyboard(' ');
    await user.keyboard('{ArrowUp}');
    await user.keyboard(' ');
    await waitFor(() => expect(reorderPostMedia).toHaveBeenCalledWith(ids.post, 1, [second.id, first.id]));
  });

  it('creates a technical draft before uploading media when a new post has no server id', async () => {
    const draft = post({ title: 'Публикация от 09.10.2026' });
    const media = {
      id: ids.post2,
      kind: 'photo' as const,
      sourceMediaId: null,
      fileName: 'cover.png',
      contentType: 'image/png',
      sizeBytes: 5,
      width: 1,
      height: 1,
      durationMs: null,
      position: 0
    };
    const ensurePost = vi.fn().mockResolvedValue(draft);
    const onDraftReady = vi.fn();
    vi.mocked(uploadPostMedia).mockResolvedValue({ media, revision: 1 });
    const user = userEvent.setup();
    render(
      <PostMediaEditor
        postId={null}
        revision={0}
        media={[]}
        disabled={false}
        onServerChange={vi.fn()}
        onPendingChange={vi.fn()}
        onEnsurePost={ensurePost}
        onDraftReady={onDraftReady}
      />
    );

    await user.upload(screen.getByTestId('media-file-input'), new File(['image'], 'cover.png', { type: 'image/png' }));
    await user.click(await screen.findByRole('button', { name: 'Добавить в пост (1)' }));
    await waitFor(() => expect(uploadPostMedia).toHaveBeenCalledWith(expect.objectContaining({ postId: draft.id })));
    expect(ensurePost).toHaveBeenCalledTimes(1);
    expect(onDraftReady).toHaveBeenCalledWith(draft);
  });

  it('promotes a new draft even when its first upload fails so it is not stranded at /posts/new', async () => {
    const draft = post({ title: 'Публикация от 09.10.2026' });
    const ensurePost = vi.fn().mockResolvedValue(draft);
    const onDraftReady = vi.fn();
    vi.mocked(uploadPostMedia).mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    render(
      <PostMediaEditor
        postId={null}
        revision={0}
        media={[]}
        disabled={false}
        onServerChange={vi.fn()}
        onPendingChange={vi.fn()}
        onEnsurePost={ensurePost}
        onDraftReady={onDraftReady}
      />
    );

    await user.upload(screen.getByTestId('media-file-input'), new File(['image'], 'cover.png', { type: 'image/png' }));
    await user.click(await screen.findByRole('button', { name: 'Добавить в пост (1)' }));
    await waitFor(() => expect(onDraftReady).toHaveBeenCalledWith(draft));
    expect(await screen.findByRole('button', { name: 'Повторить' })).toBeTruthy();
  });

  it('does not start the next queued file after cancelling the active upload', async () => {
    vi.mocked(uploadPostMedia).mockImplementation(
      ({ signal }) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
        })
    );
    const user = userEvent.setup();
    render(
      <PostMediaEditor
        postId={ids.post}
        revision={1}
        media={[]}
        disabled={false}
        onServerChange={vi.fn()}
        onPendingChange={vi.fn()}
      />
    );
    await user.upload(screen.getByTestId('media-file-input'), [
      new File(['first'], 'first.png', { type: 'image/png' }),
      new File(['second'], 'second.png', { type: 'image/png' })
    ]);
    await user.click(await screen.findByRole('button', { name: 'Добавить в пост (2)' }));
    await waitFor(() => expect(uploadPostMedia).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: 'Отменить загрузку' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Добавить в пост (2)' })).toBeTruthy());
    expect(uploadPostMedia).toHaveBeenCalledTimes(1);
    expect(screen.getByText('second.png')).toBeTruthy();
  });

  it('keeps a failed file available for retry and never calls it uploaded', async () => {
    vi.mocked(uploadPostMedia).mockRejectedValue(
      new ApiError({ code: 'CONFLICT', status: 409, message: 'stale', details: { reason: 'STALE_REVISION' } })
    );
    const user = userEvent.setup();
    render(
      <PostMediaEditor
        postId={ids.post}
        revision={2}
        media={[]}
        disabled={false}
        onServerChange={vi.fn()}
        onPendingChange={vi.fn()}
      />
    );
    const file = new File(['image'], 'cover.png', { type: 'image/png' });
    await user.upload(screen.getByTestId('media-file-input'), file);
    await user.click(await screen.findByRole('button', { name: 'Добавить в пост (1)' }));

    expect(await screen.findByText(/Черновик изменился/)).toBeTruthy();
    expect(screen.getByText(/Черновик изменился/)).toBeTruthy();
    expect(screen.queryByText('Загружено на сервер')).toBeNull();
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeTruthy();
  });

  it('reports server-confirmed upload, then removes only after server confirmation', async () => {
    const onServerChange = vi.fn();
    const media = {
      id: ids.post,
      kind: 'photo' as const,
      sourceMediaId: null,
      fileName: 'cover.png',
      contentType: 'image/png',
      sizeBytes: 5,
      width: 1,
      height: 1,
      durationMs: null,
      position: 0
    };
    vi.mocked(uploadPostMedia).mockResolvedValue({ media, revision: 3 });
    vi.mocked(deletePostMedia).mockResolvedValue({ revision: 4 });
    const user = userEvent.setup();
    render(
      <PostMediaEditor
        postId={ids.post}
        revision={2}
        media={[]}
        disabled={false}
        onServerChange={onServerChange}
        onPendingChange={vi.fn()}
      />
    );
    await user.upload(screen.getByTestId('media-file-input'), new File(['image'], 'cover.png', { type: 'image/png' }));
    await user.click(await screen.findByRole('button', { name: 'Добавить в пост (1)' }));
    await screen.findByText('Загружено на сервер');
    expect(uploadPostMedia).toHaveBeenCalledWith(
      expect.objectContaining({ postId: ids.post, revision: 2, file: expect.any(File) })
    );
    expect(onServerChange).toHaveBeenCalledWith(3, [media]);

    await user.click(screen.getByRole('button', { name: 'Убрать из поста: cover.png' }));
    await waitFor(() => expect(onServerChange).toHaveBeenLastCalledWith(4, []));
    expect(screen.queryByText('cover.png')).toBeNull();
  });

  it('rejects unsupported types per file without sending them to the API', async () => {
    render(
      <PostMediaEditor
        postId={ids.post}
        revision={0}
        media={[]}
        disabled={false}
        onServerChange={vi.fn()}
        onPendingChange={vi.fn()}
      />
    );
    fireEvent.change(screen.getByTestId('media-file-input'), {
      target: { files: [new File(['movie'], 'clip.png', { type: 'video/webm' })] }
    });
    expect((await screen.findByRole('alert')).textContent).toMatch(/часть файлов не добавлена/i);
    expect(screen.getByText('clip.png — формат или размер не поддерживается.')).toBeTruthy();
    expect(uploadPostMedia).not.toHaveBeenCalled();
  });

  it('infers canonical content type from extension when the browser MIME type is empty', async () => {
    vi.mocked(uploadPostMedia).mockResolvedValue({
      media: {
        id: ids.post,
        kind: 'photo',
        sourceMediaId: null,
        fileName: 'cover.png',
        contentType: 'image/png',
        sizeBytes: 5,
        width: 1,
        height: 1,
        durationMs: null,
        position: 0
      },
      revision: 3
    });
    render(
      <PostMediaEditor
        postId={ids.post}
        revision={2}
        media={[]}
        disabled={false}
        onServerChange={vi.fn()}
        onPendingChange={vi.fn()}
      />
    );
    fireEvent.change(screen.getByTestId('media-file-input'), {
      target: { files: [new File(['image'], 'cover.png')] }
    });
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Добавить в пост (1)' }));

    await waitFor(() =>
      expect(uploadPostMedia).toHaveBeenCalledWith(
        expect.objectContaining({ file: expect.any(File), contentType: 'image/png' })
      )
    );
  });

  it('replaces only after upload succeeds and keeps the original order position', async () => {
    const first = {
      id: ids.post,
      kind: 'photo' as const,
      sourceMediaId: null,
      fileName: 'first.png',
      contentType: 'image/png',
      sizeBytes: 5,
      width: 1,
      height: 1,
      durationMs: null,
      position: 0
    };
    const second = { ...first, id: '00000000-0000-4000-8000-000000000002', fileName: 'second.png', position: 1 };
    const replacement = {
      ...first,
      id: '00000000-0000-4000-8000-000000000003',
      fileName: 'replacement.png',
      position: 2
    };
    vi.mocked(uploadPostMedia).mockResolvedValue({ media: replacement, revision: 3 });
    vi.mocked(deletePostMedia).mockResolvedValue({ revision: 4 });
    vi.mocked(reorderPostMedia).mockResolvedValue({ revision: 5 });
    const onServerChange = vi.fn();
    const user = userEvent.setup();
    render(
      <PostMediaEditor
        postId={ids.post}
        revision={2}
        media={[first, second]}
        disabled={false}
        onServerChange={onServerChange}
        onPendingChange={vi.fn()}
      />
    );
    const input = screen.getByTestId('media-file-input') as HTMLInputElement;
    input.dataset.replaceId = first.id;
    await user.upload(input, new File(['replacement'], 'replacement.png', { type: 'image/png' }));
    await user.click(await screen.findByRole('button', { name: 'Добавить в пост (1)' }));
    await waitFor(() => expect(reorderPostMedia).toHaveBeenCalledWith(ids.post, 4, [replacement.id, second.id]));
    expect(onServerChange).toHaveBeenLastCalledWith(5, [
      { ...replacement, position: 0 },
      { ...second, position: 1 }
    ]);
  });

  it('explains that an attachment must be removed before replacing at the ten-file limit', async () => {
    const media = Array.from({ length: 10 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      kind: 'photo' as const,
      sourceMediaId: null,
      fileName: `photo-${index + 1}.png`,
      contentType: 'image/png',
      sizeBytes: 5,
      width: 1,
      height: 1,
      durationMs: null,
      position: index
    }));
    render(
      <PostMediaEditor
        postId={ids.post}
        revision={2}
        media={media}
        disabled={false}
        onServerChange={vi.fn()}
        onPendingChange={vi.fn()}
      />
    );

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'photo-1.png' }));
    const dialog = await screen.findByRole('dialog', { name: 'photo-1.png' });
    const replace = within(dialog).getByRole('button', { name: 'Заменить photo-1.png' });
    expect(replace.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/лимит 10 файлов/)).toBeTruthy();
    expect(uploadPostMedia).not.toHaveBeenCalled();
  });

  it('retains the original attachment if replacing upload fails', async () => {
    const original = {
      id: ids.post,
      kind: 'photo' as const,
      sourceMediaId: null,
      fileName: 'original.png',
      contentType: 'image/png',
      sizeBytes: 5,
      width: 1,
      height: 1,
      durationMs: null,
      position: 0
    };
    vi.mocked(uploadPostMedia).mockRejectedValue(
      new ApiError({ code: 'UNAVAILABLE', status: 503, message: 'unavailable' })
    );
    const user = userEvent.setup();
    render(
      <PostMediaEditor
        postId={ids.post}
        revision={2}
        media={[original]}
        disabled={false}
        onServerChange={vi.fn()}
        onPendingChange={vi.fn()}
      />
    );
    const input = screen.getByTestId('media-file-input') as HTMLInputElement;
    input.dataset.replaceId = original.id;
    await user.upload(input, new File(['new'], 'new.png', { type: 'image/png' }));
    await user.click(await screen.findByRole('button', { name: 'Добавить в пост (1)' }));
    expect(await screen.findByText(/Не удалось загрузить файл/)).toBeTruthy();
    expect(screen.getByText('original.png')).toBeTruthy();
    expect(deletePostMedia).not.toHaveBeenCalled();
  });

  it('keeps a server attachment visible when its private preview request fails', async () => {
    const original = {
      id: ids.post,
      kind: 'photo' as const,
      sourceMediaId: null,
      fileName: 'private.png',
      contentType: 'image/png',
      sizeBytes: 5,
      width: 1,
      height: 1,
      durationMs: null,
      position: 0
    };
    vi.mocked(getPostMediaContent).mockRejectedValue(
      new ApiError({ code: 'UNAVAILABLE', status: 503, message: 'unavailable', requestId: 'preview-7' })
    );
    render(
      <PostMediaEditor
        postId={ids.post}
        revision={2}
        media={[original]}
        disabled={false}
        onServerChange={vi.fn()}
        onPendingChange={vi.fn()}
      />
    );
    expect(await screen.findByText(/Предпросмотр недоступен\. Запрос: preview-7/)).toBeTruthy();
    expect(screen.getByText('private.png')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeTruthy();
  });

  it('shows the media-tile fallback while keeping remove available after an image decode failure', async () => {
    const media = {
      id: ids.post,
      sourceMediaId: null,
      kind: 'photo' as const,
      fileName: 'broken.png',
      contentType: 'image/png',
      sizeBytes: 5,
      width: 1,
      height: 1,
      durationMs: null,
      position: 0
    };
    render(
      <PostMediaEditor
        postId={ids.post}
        revision={1}
        media={[media]}
        disabled={false}
        onServerChange={vi.fn()}
        onPendingChange={vi.fn()}
      />
    );
    await screen.findByRole('button', { name: 'broken.png' });
    const item = screen.getByRole('listitem', { name: 'broken.png, позиция 1' });
    await waitFor(() => expect(item.querySelector('img[alt="broken.png"]')).not.toBeNull());
    const preview = item.querySelector('img[alt="broken.png"]');
    if (!preview) throw new Error('Expected the media tile to render its photo');
    fireEvent.error(preview);
    expect(await screen.findByText(/Не удалось показать изображение/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Убрать из поста: broken.png' })).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Повторить' }));
    await waitFor(() => expect(getPostMediaContent).toHaveBeenCalledTimes(2));
  });

  it('keeps attachment and reports a contextual conflict when remove is stale', async () => {
    const media = {
      id: ids.post,
      sourceMediaId: null,
      kind: 'photo' as const,
      fileName: 'keep.png',
      contentType: 'image/png',
      sizeBytes: 5,
      width: 1,
      height: 1,
      durationMs: null,
      position: 0
    };
    const onRevisionConflict = vi.fn();
    vi.mocked(deletePostMedia).mockRejectedValue(
      new ApiError({ code: 'CONFLICT', status: 409, message: 'stale', details: { reason: 'STALE_REVISION' } })
    );
    const user = userEvent.setup();
    render(
      <PostMediaEditor
        postId={ids.post}
        revision={1}
        media={[media]}
        disabled={false}
        onServerChange={vi.fn()}
        onPendingChange={vi.fn()}
        onRevisionConflict={onRevisionConflict}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Убрать из поста: keep.png' }));
    expect(await screen.findByText(/Черновик изменился\. Сравните его/)).toBeTruthy();
    expect(screen.getByText('keep.png')).toBeTruthy();
    expect(onRevisionConflict).toHaveBeenCalledOnce();
  });

  it('crops attached bytes and replaces only after server confirmation; recrops from source', async () => {
    const sourceId = ids.post2;
    const derivative = {
      id: ids.post,
      sourceMediaId: sourceId,
      kind: 'photo' as const,
      fileName: 'crop.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 5,
      width: 1,
      height: 1,
      durationMs: null,
      position: 0
    };
    vi.mocked(cropPostMedia).mockResolvedValue({ media: derivative, revision: 3 });
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined)
    });
    Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get: () => 400 });
    Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', { configurable: true, get: () => 300 });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      save: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
      restore: vi.fn()
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) =>
      callback(new Blob(['crop'], { type }))
    );
    const original = { ...derivative, id: sourceId, sourceMediaId: null, fileName: 'original.png' };
    const onServerChange = vi.fn();
    const user = userEvent.setup();
    render(
      <PostMediaEditor
        postId={ids.post}
        revision={2}
        media={[original]}
        disabled={false}
        onServerChange={onServerChange}
        onPendingChange={vi.fn()}
      />
    );
    await user.click(screen.getByRole('button', { name: 'original.png' }));
    const previewDialog = screen.getByRole('dialog', { name: 'original.png' });
    await user.click(within(previewDialog).getByRole('button', { name: 'Кадрировать' }));
    await screen.findByRole('img', { name: 'Предпросмотр кадрирования' });
    expect(getPostMediaContent).toHaveBeenCalledWith(sourceId, expect.any(AbortSignal));
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(cropPostMedia).toHaveBeenCalledWith(
        ids.post,
        sourceId,
        2,
        expect.any(Blob),
        'original.jpg',
        expect.any(String)
      )
    );
    expect(onServerChange).toHaveBeenCalledWith(3, [derivative]);
  });

  it('preserves the old attachment when crop submission fails', async () => {
    const original = {
      id: ids.post,
      sourceMediaId: null,
      kind: 'photo' as const,
      fileName: 'preserved.png',
      contentType: 'image/png',
      sizeBytes: 5,
      width: 1,
      height: 1,
      durationMs: null,
      position: 0
    };
    vi.mocked(cropPostMedia).mockRejectedValue(
      new ApiError({ code: 'UNAVAILABLE', status: 503, message: 'unavailable' })
    );
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined)
    });
    Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get: () => 400 });
    Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', { configurable: true, get: () => 300 });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      save: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
      restore: vi.fn()
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) =>
      callback(new Blob(['crop'], { type }))
    );
    const onServerChange = vi.fn();
    const user = userEvent.setup();
    render(
      <PostMediaEditor
        postId={ids.post}
        revision={2}
        media={[original]}
        disabled={false}
        onServerChange={onServerChange}
        onPendingChange={vi.fn()}
      />
    );
    await user.click(screen.getByRole('button', { name: 'preserved.png' }));
    const previewDialog = await screen.findByRole('dialog', { name: 'preserved.png' });
    await user.click(within(previewDialog).getByRole('button', { name: 'Кадрировать' }));
    await screen.findByRole('img', { name: 'Предпросмотр кадрирования' });
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText(/исходное вложение сохранено/i)).toBeTruthy();
    expect(screen.getByText('preserved.png')).toBeTruthy();
    expect(onServerChange).not.toHaveBeenCalled();
  });
});
