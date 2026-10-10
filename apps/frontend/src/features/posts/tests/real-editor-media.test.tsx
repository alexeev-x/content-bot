import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { accessToken, ids, post } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { uploadPostMedia } from '../api/post-media-api';
import { renderEditorApp } from './harness';

vi.mock('../api/post-media-api', () => ({
  attachLibraryMedia: vi.fn(),
  cropPostMedia: vi.fn(),
  deletePostMedia: vi.fn(),
  getPostMediaContent: vi.fn().mockResolvedValue(new Blob(['private image'], { type: 'image/jpeg' })),
  listMediaLibrary: vi.fn(),
  reorderPostMedia: vi.fn(),
  uploadPostMedia: vi.fn()
}));

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:real-editor-photo') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.mocked(uploadPostMedia).mockReset();
});
afterEach(cleanup);

describe('real post editor media adoption', () => {
  it('keeps media uploaded to a newly created draft after navigation and adopts the next revision', async () => {
    const attached = {
      id: ids.post2,
      sourceMediaId: null,
      kind: 'photo' as const,
      fileName: 'altai_lake.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 147_294,
      width: 1600,
      height: 1200,
      durationMs: null,
      position: 0
    };
    let serverPost = post({ title: 'Публикация от 09.10.2026' });
    server.use(
      http.post('*/api/v1/posts', async ({ request }) => {
        const input = (await request.json()) as { title: string; body: string; entities: [] };
        serverPost = post({ ...input, revision: 0 });
        return HttpResponse.json(serverPost, { status: 201 });
      }),
      http.get('*/api/v1/posts/:id', () => HttpResponse.json(serverPost))
    );
    vi.mocked(uploadPostMedia).mockImplementation(async ({ postId, revision }) => {
      expect(postId).toBe(ids.post);
      expect(revision).toBe(0);
      serverPost = { ...serverPost, revision: 1, media: [attached] };
      return { media: attached, revision: 1 };
    });

    const revisions: number[] = [];
    server.use(
      http.patch('*/api/v1/posts/:id', async ({ request }) => {
        const input = (await request.json()) as { revision: number; title?: string };
        revisions.push(input.revision);
        serverPost = { ...serverPost, title: input.title ?? serverPost.title, revision: input.revision + 1 };
        return HttpResponse.json(serverPost);
      })
    );

    const user = userEvent.setup();
    const { client, router } = renderEditorApp('/posts/new');
    const image = new File([new Uint8Array(147_294)], attached.fileName, { type: 'image/jpeg' });
    await user.click(await screen.findByRole('button', { name: 'Добавить медиа' }));
    await user.upload(await screen.findByTestId('media-file-input'), image);
    expect(await screen.findByText(attached.fileName)).toBeTruthy();
    expect(await screen.findByText('Готов к добавлению')).toBeTruthy();
    const addToPostLabel = await screen.findByText('Добавить в пост (1)');
    const addToPost = addToPostLabel.closest('button');
    if (!addToPost) throw new Error('Add-to-post action must be a button');
    await user.click(addToPost);

    await waitFor(() => expect(uploadPostMedia).toHaveBeenCalled());
    await waitFor(() => expect(router.state.location.pathname).toBe(`/posts/${ids.post}`));
    await screen.findByText('altai_lake.jpg');
    expect(screen.getByText('Загружено на сервер')).toBeTruthy();
    expect(client.getQueryData(['posts', 'detail', ids.post])).toMatchObject({ revision: 1, media: [attached] });
    const title = screen.getByRole('textbox', { name: /Заголовок/ });
    await user.clear(title);
    await user.type(title, 'Следующая правка');
    await waitFor(() => expect(revisions).toEqual([1]), { timeout: 5_000 });
    expect(client.getQueryData(['posts', 'detail', ids.post])).toMatchObject({ revision: 2, media: [attached] });
    expect(uploadPostMedia).toHaveBeenCalledTimes(1);
  });
});
