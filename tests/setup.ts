import { vi } from 'vitest';
import { beforeEach } from 'vitest';

/**
 * Тест не должен незаметно сходить в сеть: тестовый прогон подхватывает настоящий `.dev.vars`,
 * поэтому любой исходящий запрос роняем. Появится внешний клиент — здесь встанет его перехват.
 */
beforeEach(() => {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    throw new Error(`Неожиданный исходящий запрос: ${url}`);
  });
});
