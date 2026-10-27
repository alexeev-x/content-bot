// Stats bridge (owner, 25.10.2026: «делаем мост», «мост должен быть тупой — ключей не держим, всё передаём запросом»,
// «не хочу карточки вводить»): runs on Deno Deploy's free plan (no card, sign-in with GitHub) with addresses outside
// Cloudflare, because STRATZ and OpenDota refuse Cloudflare's shared ones (STRATZ 403, OpenDota 429). It holds no keys:
// the Worker sends STRATZ's token in its own Authorization header and the bridge passes it on. It forwards only to
// STRATZ's GraphQL and an allowlist of OpenDota reads, caches good answers for 10 minutes per instance and keeps each
// instance under OpenDota's free limits. Web-standard code only; it never logs a header or a body.

const CACHE_MS = 10 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 20_000;
const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_RESPONSE_BYTES = 3 * 1024 * 1024;
const OPENDOTA_PER_MINUTE = 50;
const OPENDOTA_PER_DAY = 2800;
const STRATZ_PER_MINUTE = 60;
const OPENDOTA_PATHS = [
  /^\/heroStats$/,
  /^\/heroes\/\d{1,3}\/(matchups|itemPopularity|durations)$/,
  /^\/scenarios\/itemTimings$/,
  /^\/records\/(duration|kills|gold_per_min)$/,
  /^\/publicMatches$/,
  /^\/matches\/\d{1,12}$/
];

/** @type {Map<string, { at: number; status: number; body: string }>} */
const cache = new Map();
const opendota = { minute: [], dayStart: Date.now(), day: 0 };
const stratz = { minute: [] };

function allowedNow(counter, perMinute, perDay) {
  const now = Date.now();
  if (perDay !== undefined && now - counter.dayStart > 86_400_000) {
    counter.dayStart = now;
    counter.day = 0;
  }
  counter.minute = counter.minute.filter((at) => now - at < 60_000);
  if (counter.minute.length >= perMinute) return false;
  if (perDay !== undefined && counter.day >= perDay) return false;
  counter.minute.push(now);
  if (perDay !== undefined) counter.day += 1;
  return true;
}

async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function upstream(url, init) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  const body = await response.text();
  if (body.length > MAX_RESPONSE_BYTES) return { status: 502, body: '{"error":"UPSTREAM_TOO_BIG"}' };
  return { status: response.status, body };
}

async function cached(key, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit;
  const fresh = { at: Date.now(), ...(await load()) };
  // Only good answers are kept, so a refusal is asked again next time.
  if (fresh.status === 200) cache.set(key, fresh);
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return fresh;
}

const json = (status, body) =>
  new Response(body, {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
const fresh = (key) => {
  const hit = cache.get(key);
  return hit !== undefined && Date.now() - hit.at < CACHE_MS;
};

async function handle(request) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/health') return json(200, '{"ok":true}');

  if (request.method === 'POST' && url.pathname === '/stratz/graphql') {
    const authorization = request.headers.get('authorization') ?? '';
    if (!/^Bearer [\w.-]{20,4000}$/.test(authorization)) return json(401, '{"error":"NO_STRATZ_TOKEN"}');
    const raw = await request.text();
    if (raw.length > MAX_REQUEST_BYTES) return json(413, '{"error":"TOO_BIG"}');
    let query;
    try {
      query = JSON.parse(raw).query;
    } catch {
      return json(400, '{"error":"BAD_QUERY"}');
    }
    if (typeof query !== 'string' || query.length > 4000 || /\bmutation\b/i.test(query)) {
      return json(400, '{"error":"BAD_QUERY"}');
    }
    // Keyed by the caller's token and the query, so one caller never gets another's answers.
    const key = `stratz:${await sha256(`${authorization}\n${query}`)}`;
    if (!fresh(key) && !allowedNow(stratz, STRATZ_PER_MINUTE)) return json(429, '{"error":"BRIDGE_STRATZ_LIMIT"}');
    const answer = await cached(key, () =>
      upstream('https://api.stratz.com/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization, 'user-agent': 'STRATZ_API' },
        body: JSON.stringify({ query })
      })
    );
    return json(answer.status, answer.body);
  }

  if (request.method === 'GET' && url.pathname.startsWith('/opendota/')) {
    const path = url.pathname.slice('/opendota'.length);
    if (!OPENDOTA_PATHS.some((pattern) => pattern.test(path))) return json(404, '{"error":"NOT_ALLOWED"}');
    const target = `https://api.opendota.com/api${path}${url.search}`;
    const key = `opendota:${target}`;
    if (!fresh(key) && !allowedNow(opendota, OPENDOTA_PER_MINUTE, OPENDOTA_PER_DAY)) {
      return json(429, '{"error":"BRIDGE_OPENDOTA_LIMIT"}');
    }
    const answer = await cached(key, () => upstream(target, { headers: { accept: 'application/json' } }));
    return json(answer.status, answer.body);
  }

  return json(404, '{"error":"NOT_FOUND"}');
}

globalThis.Deno.serve(async (request) => {
  const startedAt = Date.now();
  let response;
  try {
    response = await handle(request);
  } catch {
    response = json(502, '{"error":"UPSTREAM_FAILED"}');
  }
  console.log(
    JSON.stringify({
      method: request.method,
      path: new URL(request.url).pathname,
      status: response.status,
      ms: Date.now() - startedAt
    })
  );
  return response;
});
