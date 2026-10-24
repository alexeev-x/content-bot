import { type InviteLinksDto, inviteLinksSchema } from '@alexeev/contracts';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, setSession } from '../../../shared/api/session';
import { accessToken, errorBody } from '../../../test/fixtures';
import { server, setupMswServer } from '../../../test/msw';
import { createTestQueryClient } from '../../../test/query-wrapper';
import { InviteLinksPanel } from '../ui/InviteLinksPanel';

// Plan B1: a link that silently fails to appear, or an error the owner cannot act on, means a traffic source
// goes uncounted.

setupMswServer();
beforeEach(() => {
  clearSession();
  setSession(accessToken());
});
afterEach(cleanup);

const T = '2026-10-20T08:00:00.000Z';
const listing: InviteLinksDto = inviteLinksSchema.parse({
  channel: 'alexeev_x',
  links: [
    {
      id: 'a1b2c3d4-0000-4000-8000-000000000001',
      name: 'TikTok — шапка профиля',
      url: 'https://t.me/+AbCdEf123456',
      createdAt: T,
      revokedAt: null,
      joined: 41,
      left: 6
    }
  ],
  withoutLink: { joined: 9, left: 3 },
  trackingSince: T
});

function renderPanel(data: InviteLinksDto = listing) {
  server.use(http.get('*/api/v1/content-analytics/invite-links', () => HttpResponse.json(data)));
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <InviteLinksPanel days={30} onOpenSettings={() => {}} />
    </QueryClientProvider>
  );
}

describe('InviteLinksPanel', () => {
  it('shows each source with who came, who left and who stayed, and the joins without a link', async () => {
    renderPanel();
    const list = await screen.findByRole('list', { name: 'Источники подписчиков' });
    const [tiktok, without] = within(list).getAllByRole('listitem');
    expect(tiktok?.textContent).toContain('TikTok — шапка профиля');
    expect(tiktok?.textContent).toContain('41 пришли');
    expect(tiktok?.textContent).toContain('6 ушли');
    expect(tiktok?.textContent).toContain('35 остались');
    expect(without?.textContent).toContain('Без ссылки');
    expect(without?.textContent).toContain('9 пришли');
  });

  it('creates a link and shows it ready to copy', async () => {
    const user = userEvent.setup();
    let sent: unknown = null;
    server.use(
      http.post('*/api/v1/content-analytics/invite-links', async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(
          {
            ...listing.links[0],
            id: 'a1b2c3d4-0000-4000-8000-000000000009',
            name: 'YouTube — описание',
            joined: 0,
            left: 0,
            url: 'https://t.me/+New'
          },
          { status: 201 }
        );
      })
    );
    renderPanel();
    await user.click(await screen.findByRole('button', { name: 'Новая ссылка' }));
    await user.click(screen.getByRole('button', { name: 'YouTube — описание' }));
    await user.click(screen.getByRole('button', { name: 'Создать' }));
    expect(await screen.findByRole('dialog', { name: 'Ссылка готова' })).toBeTruthy();
    expect(screen.getByText('https://t.me/+New')).toBeTruthy();
    expect(sent).toEqual({ name: 'YouTube — описание' });
  });

  it('says the name is taken at the field, and what to fix when the bot cannot invite', async () => {
    const user = userEvent.setup();
    let reason = 'NAME_TAKEN';
    server.use(
      http.post('*/api/v1/content-analytics/invite-links', () =>
        reason === 'NAME_TAKEN'
          ? HttpResponse.json(errorBody('VALIDATION_ERROR', { reason }), { status: 400 })
          : HttpResponse.json(errorBody('UNAVAILABLE', { reason }), { status: 503 })
      )
    );
    renderPanel();
    await user.click(await screen.findByRole('button', { name: 'Новая ссылка' }));
    await user.type(screen.getByRole('textbox', { name: 'Источник' }), 'TikTok — шапка профиля');
    await user.click(screen.getByRole('button', { name: 'Создать' }));
    expect(await screen.findByText('Ссылка с таким названием уже есть')).toBeTruthy();

    reason = 'BOT_CANNOT_INVITE';
    await user.clear(screen.getByRole('textbox', { name: 'Источник' }));
    await user.type(screen.getByRole('textbox', { name: 'Источник' }), 'Реклама');
    await user.click(screen.getByRole('button', { name: 'Создать' }));
    expect(await screen.findByText('Бот не может создавать ссылки')).toBeTruthy();
    expect(screen.getByText(/правом «Пригласительные ссылки»/)).toBeTruthy();
  });

  it('asks to reconnect the bot while no join has ever arrived', async () => {
    renderPanel({ ...listing, trackingSince: null, withoutLink: { joined: 0, left: 0 } });
    expect(await screen.findByText(/переподключите бота/)).toBeTruthy();
  });
});
