import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../shared/api/http-client';
import { clearSession, setSession } from '../../../shared/api/session';
import { accessToken, ids } from '../../../test/fixtures';
import { deletePostMedia, getPostMediaContent, reorderPostMedia, uploadPostMedia } from '../api/post-media-api';
import { PostMediaEditor } from '../ui/PostMediaEditor';

vi.mock('../api/post-media-api', () => ({
  deletePostMedia: vi.fn(),
  getPostMediaContent: vi.fn(),
  reorderPostMedia: vi.fn(),
  uploadPostMedia: vi.fn()
}));
beforeEach(() => {
  clearSession();
  setSession(accessToken());
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:local-preview') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.mocked(uploadPostMedia).mockReset();
  vi.mocked(deletePostMedia).mockReset();
  vi.mocked(reorderPostMedia).mockReset();
  vi.mocked(getPostMediaContent).mockResolvedValue(new Blob(['private media'], { type: 'image/png' }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('post media editor', () => {
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
    await screen.findByText('Загружено на сервер');
    expect(uploadPostMedia).toHaveBeenCalledWith(
      expect.objectContaining({ postId: ids.post, revision: 2, file: expect.any(File) })
    );
    expect(onServerChange).toHaveBeenCalledWith(3, [media]);

    await user.click(screen.getByRole('button', { name: 'Убрать cover.png' }));
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
    expect((await screen.findByRole('alert')).textContent).toMatch(/clip.png.*JPG, PNG, WebP/);
    expect(uploadPostMedia).not.toHaveBeenCalled();
  });

  it('infers canonical content type from extension when the browser MIME type is empty', async () => {
    vi.mocked(uploadPostMedia).mockResolvedValue({
      media: {
        id: ids.post,
        kind: 'photo',
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
    await waitFor(() => expect(reorderPostMedia).toHaveBeenCalledWith(ids.post, 4, [replacement.id, second.id]));
    expect(onServerChange).toHaveBeenLastCalledWith(5, [
      { ...replacement, position: 0 },
      { ...second, position: 1 }
    ]);
  });

  it('explains that an attachment must be removed before replacing at the ten-file limit', () => {
    const media = Array.from({ length: 10 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      kind: 'photo' as const,
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

    const replace = screen.getByRole('button', { name: /^Заменить photo-1\.png$/ });
    expect(replace.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/лимит 10 файлов/)).toBeTruthy();
    expect(uploadPostMedia).not.toHaveBeenCalled();
  });

  it('retains the original attachment if replacing upload fails', async () => {
    const original = {
      id: ids.post,
      kind: 'photo' as const,
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
    expect(await screen.findByText(/Не удалось загрузить файл/)).toBeTruthy();
    expect(screen.getByText('original.png')).toBeTruthy();
    expect(deletePostMedia).not.toHaveBeenCalled();
  });

  it('keeps a server attachment visible when its private preview request fails', async () => {
    const original = {
      id: ids.post,
      kind: 'photo' as const,
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
});
