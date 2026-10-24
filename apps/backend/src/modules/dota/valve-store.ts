// Valve's store prices of Dota items (owner, 22.10.2026: «вот идеально», dollars are fine): the endpoint dota2.com's
// own event pages call, keyless. The currency follows the caller's country; a Worker gets dollars.

const PRICES_URL = 'https://www.dota2.com/react/getbpprices';
const TIMEOUT_MS = 10_000;
const MAX_IDS = 20;
const PRICE = /^[^\d]{0,4}\d{1,6}(?:[.,]\d{1,2})?[^\d]{0,4}$/;

/** Item id → its price as Valve writes it («$14.99»); an item Valve does not answer for is left out. Never throws. */
export async function fetchStorePrices(
  itemIds: readonly number[],
  fetchImpl: typeof fetch = fetch
): Promise<Map<number, string>> {
  const prices = new Map<number, string>();
  const ids = [...new Set(itemIds)].filter((id) => Number.isSafeInteger(id) && id > 0).slice(0, MAX_IDS);
  if (ids.length === 0) return prices;
  try {
    const response = await fetchImpl(`${PRICES_URL}?item_defs=${ids.join(',')}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!response.ok) return prices;
    const body: unknown = await response.json();
    if (body === null || typeof body !== 'object') return prices;
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      const id = Number(key);
      if (ids.includes(id) && typeof value === 'string' && PRICE.test(value.trim())) prices.set(id, value.trim());
    }
  } catch {
    // A price is a nice extra for the post: without it the post is written from the page alone.
  }
  return prices;
}
