import { describe, expect, it } from 'vitest';
import { createOwnerReports, type OwnerReportDeps } from './owner-reports';

const NOW = 1_800_000_000_000;

function reports(over: Partial<OwnerReportDeps> & { unknown?: number; failed?: number; zone?: string | null } = {}) {
  const queries: string[] = [];
  const rows = (n: number) => Array.from({ length: n }, () => ({ timezone: over.zone ?? 'Europe/Moscow' }));
  const deps: OwnerReportDeps = {
    clock: { now: () => NOW },
    appOrigin: 'https://studio.example.com',
    publications: {
      list: (query) => {
        queries.push(`list ${query.status ?? 'latest'} limit ${query.limit}`);
        if (query.status === 'unknown') return Promise.resolve(rows(Math.min(over.unknown ?? 0, query.limit)) as never);
        if (query.status === 'failed') return Promise.resolve(rows(Math.min(over.failed ?? 0, query.limit)) as never);
        return Promise.resolve((over.zone === null ? [] : rows(1)) as never);
      },
      listUpcoming: (limit) => {
        queries.push(`upcoming ${limit}`);
        return Promise.resolve([]);
      },
      summarizeRange: () => Promise.reject(new Error('unexpected'))
    },
    incidents: {
      countOpenIncidents: (limit) => {
        queries.push(`incidents ${limit}`);
        return Promise.resolve(Math.min(over.failed ?? 0, limit));
      }
    },
    posts: { findRevision: () => Promise.resolve(null) },
    cron: { readCronRun: () => Promise.resolve({ at: NOW - 60_000, status: 'ok' as const, durationMs: 5 }) },
    publishing: { enabled: true },
    ...over
  };
  return { reports: createOwnerReports(deps), queries };
}

describe('/status', () => {
  it('says that publishing is on but cannot send without a bot token', async () => {
    const { reports: r } = reports({ publishing: { enabled: false, blockedBy: 'bot_token_missing' } });
    expect((await r.status()).html).toContain('Публикация: включена, но не задан токен бота');
  });

  it('says that publishing is off', async () => {
    const { reports: r } = reports({ publishing: { enabled: false } });
    expect((await r.status()).html).toContain('Публикация: выключена');
  });

  it('stops counting at its caps and still reads a bounded number of rows', async () => {
    const { reports: r, queries } = reports({ unknown: 50, failed: 50 });

    const answer = await r.status();

    expect(answer.html).toContain('неизвестно 5+, не отправлено 5+, открытых инцидентов 20+');
    expect(queries.sort()).toEqual(['incidents 21', 'list failed limit 6', 'list unknown limit 6']);
  });

  it('reports a failed Cron run', async () => {
    const { reports: r } = reports({
      cron: { readCronRun: () => Promise.resolve({ at: NOW - 60_000, status: 'error' as const, durationMs: 5 }) }
    });
    expect((await r.status()).html).toContain('Cron: последний запуск 1 мин назад, с ошибкой');
  });
});

describe('/next', () => {
  it('reads at most five publications and uses Europe/Moscow before any publication exists', async () => {
    const { reports: r, queries } = reports({ zone: null });

    const answer = await r.next();

    expect(answer).toEqual({
      html: 'Запланированных публикаций нет.',
      button: { text: 'Все запланированные', url: 'https://studio.example.com/publications?status=scheduled' }
    });
    expect(queries.sort()).toEqual(['list latest limit 1', 'upcoming 5']);
  });
});
