import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BackToPosts } from './BackToPosts';

async function renderLink() {
  const root = createRootRoute({ component: BackToPosts });
  const router = createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: ['/'] }) });
  render(<RouterProvider router={router} />);
  await router.load();
}

afterEach(() => {
  cleanup();
  delete (window as unknown as { Telegram?: unknown }).Telegram;
});

describe('BackToPosts', () => {
  it('shows the in-page link in a browser', async () => {
    await renderLink();
    expect(await screen.findByRole('link', { name: /Все посты/ })).toBeTruthy();
  });

  it('is hidden inside the Mini App, where Telegram BackButton leads back', async () => {
    (window as unknown as { Telegram: unknown }).Telegram = { WebApp: { initData: 'query_id=1&hash=x' } };
    await renderLink();
    expect(screen.queryByRole('link', { name: /Все посты/ })).toBeNull();
  });
});
