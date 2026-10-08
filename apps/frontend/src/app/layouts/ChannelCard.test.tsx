import { cleanup, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../shared/api/session';
import { accessToken, destination } from '../../test/fixtures';
import { server, setupMswServer } from '../../test/msw';
import { renderPage } from '../../test/render-app';
import { ChannelCard } from './ChannelCard';

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
  server.use(
    http.get('*/api/v1/health', () =>
      HttpResponse.json({
        status: 'ok',
        service: 'content-bot',
        publishingEnabled: true,
        time: '2026-10-07T10:05:00.000Z'
      })
    ),
    http.get('*/api/v1/bot/status', () =>
      HttpResponse.json({
        missing: [],
        botUsername: 'alexeev_bot',
        expectedUrl: 'https://app.example.test/webhooks/telegram',
        webhook: {
          url: 'https://app.example.test/webhooks/telegram',
          pointsHere: true,
          pendingUpdateCount: 0,
          lastErrorAt: null,
          lastErrorMessage: null
        }
      })
    )
  );
});
afterEach(cleanup);

describe('ChannelCard', () => {
  it('is one row with the first enabled channel, its state and a link to the channels; no subscriber count', async () => {
    server.use(
      http.get('*/api/v1/destinations', ({ request }) => {
        expect(new URL(request.url).searchParams.get('enabled')).toBe('true');
        return HttpResponse.json({ items: [destination({ title: 'Dota Studio' })], nextCursor: null });
      })
    );
    await renderPage(<ChannelCard collapsed={false} />);
    const link = await screen.findByRole('link', { name: /Подключённый канал: Dota Studio, бот работает/ });
    expect(link.getAttribute('href')).toBe('/settings/channels');
    expect(within(link).getByText('Dota Studio')).toBeTruthy();
    expect(link.textContent).not.toMatch(/подписчик/i);
  });

  it('collapses to the avatar and keeps the name for assistive technology and the tooltip', async () => {
    server.use(
      http.get('*/api/v1/destinations', () =>
        HttpResponse.json({ items: [destination({ title: 'Dota Studio' })], nextCursor: null })
      )
    );
    await renderPage(<ChannelCard collapsed />);
    const link = await screen.findByRole('link', { name: /Dota Studio/ });
    expect(link.textContent).toBe('');
    expect(link.getAttribute('title')).toBe('Dota Studio');
  });

  it('offers to add a channel when none is connected', async () => {
    server.use(http.get('*/api/v1/destinations', () => HttpResponse.json({ items: [], nextCursor: null })));
    await renderPage(<ChannelCard collapsed={false} />);
    const link = await screen.findByRole('link', { name: 'Канал не подключён' });
    expect(link.getAttribute('href')).toBe('/settings/channels');
  });
});
