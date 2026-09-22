import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('воркер', () => {
  it('поднимается и отвечает 404 на неизвестный путь', async () => {
    const response = await SELF.fetch('https://worker.test/');
    expect(response.status).toBe(404);
  });
});
