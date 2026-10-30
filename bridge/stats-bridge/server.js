// Stats bridge (owner, 25.10.2026: «делаем мост», «мост должен быть тупой — ключей не держим, всё передаём запросом»,
// «не хочу карточки вводить»). Runs as a free Render web service (owner, 30.10.2026): one always-on Node process with
// addresses outside Cloudflare, because STRATZ and OpenDota refuse Cloudflare's shared ones (STRATZ 403, OpenDota 429).
// Deno Deploy billed memory per loaded second and ran out in a day; Google Apps Script gets STRATZ's bot challenge.
// It holds no keys: the Worker sends STRATZ's token in its own Authorization header and the bridge passes it on. It
// forwards only to STRATZ's GraphQL and an allowlist of OpenDota reads, caches good answers for 10 minutes, keeps
// under OpenDota's free limits, gzips its answers and stops for the UTC day after OUT_PER_DAY bytes, so the free
// plan's monthly bandwidth is never spent (a spent one suspends the service for the rest of the month). Node's
// standard library only; it never logs a header or a body.

import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const CACHE_MS = 10 * 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 20_000;
const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_RESPONSE_BYTES = 3 * 1024 * 1024;
const OPENDOTA_PER_MINUTE = 50;
const OPENDOTA_PER_DAY = 2800;
const STRATZ_PER_MINUTE = 60;
/** ≈ 3 GB a month; measured 30.10 on Deno: ≈ 41 KB per answer before gzip, ≈ 12 KB after, so ≈ 8 000 answers a day. */
const OUT_PER_DAY = 100 * 1024 * 1024;
const OPENDOTA_PATHS = [
  /^\/heroStats$/,
  /^\/heroes\/\d{1,3}\/(matchups|itemPopularity|durations)$/,
  /^\/scenarios\/itemTimings$/,
  /^\/records\/(duration|kills|gold_per_min)$/,
  /^\/matches\/\d{1,12}$/
];

/** @type {Map<string, { at: number; status: number; body: string }>} */
const cache = new Map();
const opendota = { minute: [], dayStart: Date.now(), day: 0 };
const stratz = { minute: [] };
const out = { day: '', bytes: 0 };

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

/** Bytes sent today (UTC); a restart forgets them, which only ever lets the day send less than twice the cap. */
function sentToday() {
  const today = new Date().toISOString().slice(0, 10);
  if (out.day !== today) {
    out.day = today;
    out.bytes = 0;
  }
  return out;
}

const secondsToUtcMidnight = () => Math.ceil((86_400_000 - (Date.now() % 86_400_000)) / 1000);
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

async function upstream(url, init) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
  const body = await response.text();
  if (body.length > MAX_RESPONSE_BYTES) return { status: 502, body: '{"error":"UPSTREAM_TOO_BIG"}' };
  const headers = {};
  for (const name of ['retry-after', 'www-authenticate']) {
    const value = response.headers.get(name);
    if (value !== null) headers[name] = value;
  }
  return { status: response.status, body, headers };
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

const refusal = (status, error, headers) => ({ status, body: JSON.stringify({ error }), headers });
const fresh = (key) => {
  const hit = cache.get(key);
  return hit !== undefined && Date.now() - hit.at < CACHE_MS;
};

/** @param {{ method: string; url: URL; authorization: string; raw: string }} request */
async function handle(request) {
  const { url } = request;
  if (request.method === 'GET' && url.pathname === '/health') return { status: 200, body: '{"ok":true}' };

  if (sentToday().bytes >= OUT_PER_DAY) {
    return refusal(429, 'BRIDGE_DAY_TRAFFIC', { 'retry-after': String(secondsToUtcMidnight()) });
  }

  if (request.method === 'POST' && url.pathname === '/stratz/graphql') {
    const { authorization } = request;
    if (!/^Bearer [\w.-]{20,4000}$/.test(authorization)) return refusal(401, 'NO_STRATZ_TOKEN');
    let query;
    try {
      query = JSON.parse(request.raw).query;
    } catch {
      return refusal(400, 'BAD_QUERY');
    }
    if (typeof query !== 'string' || query.length > 4000 || /\bmutation\b/i.test(query)) {
      return refusal(400, 'BAD_QUERY');
    }
    // Keyed by the caller's token and the query, so one caller never gets another's answers.
    const key = `stratz:${sha256(`${authorization}\n${query}`)}`;
    if (!fresh(key) && !allowedNow(stratz, STRATZ_PER_MINUTE)) return refusal(429, 'BRIDGE_STRATZ_LIMIT');
    return cached(key, () =>
      upstream('https://api.stratz.com/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization, 'user-agent': 'STRATZ_API' },
        body: JSON.stringify({ query })
      })
    );
  }

  if (request.method === 'GET' && url.pathname.startsWith('/opendota/')) {
    const path = url.pathname.slice('/opendota'.length);
    if (!OPENDOTA_PATHS.some((pattern) => pattern.test(path))) return refusal(404, 'NOT_ALLOWED');
    const target = `https://api.opendota.com/api${path}${url.search}`;
    const key = `opendota:${target}`;
    if (!fresh(key) && !allowedNow(opendota, OPENDOTA_PER_MINUTE, OPENDOTA_PER_DAY)) {
      return refusal(429, 'BRIDGE_OPENDOTA_LIMIT');
    }
    return cached(key, () => upstream(target, { headers: { accept: 'application/json' } }));
  }

  return refusal(404, 'NOT_FOUND');
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {
        reject(new Error('TOO_BIG'));
        request.destroy();
      } else chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

createServer(async (request, response) => {
  const startedAt = Date.now();
  const url = new URL(request.url ?? '/', 'http://bridge');
  let answer;
  try {
    const raw = request.method === 'POST' ? await readBody(request) : '';
    answer = await handle({
      method: request.method ?? 'GET',
      url,
      authorization: String(request.headers.authorization ?? ''),
      raw
    });
  } catch (error) {
    answer =
      error instanceof Error && error.message === 'TOO_BIG' ? refusal(413, 'TOO_BIG') : refusal(502, 'UPSTREAM_FAILED');
  }
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...answer.headers
  };
  let body = Buffer.from(answer.body, 'utf8');
  if (/\bgzip\b/.test(String(request.headers['accept-encoding'] ?? ''))) {
    body = gzipSync(body);
    headers['content-encoding'] = 'gzip';
  }
  sentToday().bytes += body.length;
  response.writeHead(answer.status, { ...headers, 'content-length': body.length });
  response.end(body);
  console.log(
    JSON.stringify({ method: request.method, path: url.pathname, status: answer.status, ms: Date.now() - startedAt })
  );
}).listen(Number(process.env.PORT ?? 10000), '0.0.0.0');
