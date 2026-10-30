// The stats bridge has a spare (owner, 30.10.2026: «если у одного лимит, прыгаем на другой»): Render first, Vercel when
// Render is down. Only two, never taken in turns: STRATZ allows one token two addresses per 15 minutes. A call goes to
// the spare only when the main bridge itself failed — unreachable, a host's error page without the bridge's
// `x-stats-bridge` mark (asleep, suspended), or its own day-traffic refusal — never on a source's answer (STRATZ's
// 403, 429 or 5xx pass through either bridge alike). A call the caller aborted (its timeout) is not repeated.

/** A fetch that sends calls under `main` to `spare` when the main bridge is down. */
export function spareBridgeFetch(main: string, spare: string, fetchImpl: typeof fetch): typeof fetch {
  const mainOrigin = main.replace(/\/+$/u, '');
  const spareOrigin = spare.replace(/\/+$/u, '');
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    let first: Response | null = null;
    try {
      first = await fetchImpl(url, init);
    } catch (error) {
      if (init?.signal?.aborted === true || !url.startsWith(`${mainOrigin}/`)) throw error;
    }
    if (first !== null && (!url.startsWith(`${mainOrigin}/`) || !bridgeDown(first))) return first;
    await first?.body?.cancel();
    return fetchImpl(`${spareOrigin}${url.slice(mainOrigin.length)}`, init);
  };
}

function bridgeDown(response: Response): boolean {
  if (response.headers.get('x-stats-bridge') !== '1') return true;
  return response.headers.get('x-bridge-refusal') === 'BRIDGE_DAY_TRAFFIC';
}
