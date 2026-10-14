export const OPENDOTA_HERO_STATS_URL = 'https://api.opendota.com/api/heroStats';

const FETCH_TIMEOUT_MS = 8_000;

export function createOpenDotaHeroStatisticsFetcher(fetchImpl: typeof fetch = fetch): () => Promise<Response> {
  return () =>
    fetchImpl(OPENDOTA_HERO_STATS_URL, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'error'
    });
}
