import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SystemHealth } from '../index';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderHealth() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SystemHealth />
    </QueryClientProvider>
  );
}

const body = (publishingEnabled: boolean) => ({
  status: 'ok',
  service: 'content-bot',
  publishingEnabled,
  time: '2026-10-03T10:00:00.000Z'
});

describe('SystemHealth', () => {
  it('shows loading, then the ready state with publishing disabled', async () => {
    server.use(http.get('*/api/v1/health', () => HttpResponse.json(body(false))));
    renderHealth();
    expect(screen.getByRole('status')).toBeTruthy();
    expect(await screen.findByText('Публикация отключена')).toBeTruthy();
    expect(screen.getByText(/content-bot/)).toBeTruthy();
  });

  it('shows an error with retry on 503 and recovers', async () => {
    let fail = true;
    server.use(
      http.get('*/api/v1/health', () => (fail ? HttpResponse.json({}, { status: 503 }) : HttpResponse.json(body(true))))
    );
    renderHealth();
    expect(await screen.findByRole('alert')).toBeTruthy();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByText('Публикация включена')).toBeTruthy();
  });
});
