// Stats bridge (owner, 25.10.2026: «делаем мост», «мост должен быть тупой — ключей не держим, всё передаём запросом»):
// a tiny server on a free VM with its own address, because STRATZ and OpenDota refuse Cloudflare's shared addresses
// (STRATZ 403, OpenDota 429). It holds no keys: the Worker sends STRATZ's token in its own Authorization header and the
// bridge passes it on. It forwards only to STRATZ's GraphQL and an allowlist of OpenDota reads, caches good answers for
// 10 minutes and keeps OpenDota under its free limits (60 a minute, 3 000 a day). Node 20+, no dependencies. It never
// logs a header or a body.
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '127.0.0.1';
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
  if (counter.dayStart !== undefined && now - counter.dayStart > 86_400_000) {
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

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) throw new Error('TOO_BIG');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
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

const send = (response, status, body) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(body);
};

const server = createServer(async (request, response) => {
  const startedAt = Date.now();
  const url = new URL(request.url ?? '/', 'http://bridge');
  let status = 500;
  try {
    if (request.method === 'GET' && url.pathname === '/health') {
      status = 200;
      return send(response, 200, '{"ok":true}');
    }
    if (request.method === 'POST' && url.pathname === '/stratz/graphql') {
      const authorization = String(request.headers.authorization ?? '');
      if (!/^Bearer [\w.-]{20,4000}$/.test(authorization)) {
        status = 401;
        return send(response, 401, '{"error":"NO_STRATZ_TOKEN"}');
      }
      const query = JSON.parse(await readBody(request)).query;
      if (typeof query !== 'string' || query.length > 4000 || /\bmutation\b/i.test(query)) {
        status = 400;
        return send(response, 400, '{"error":"BAD_QUERY"}');
      }
      // The cache is keyed by the query and the caller's token, so one caller never gets another's answers.
      const key = `stratz:${createHash('sha256').update(`${authorization}\n${query}`).digest('hex')}`;
      const hit = cache.get(key);
      if (!(hit && Date.now() - hit.at < CACHE_MS) && !allowedNow(stratz, STRATZ_PER_MINUTE)) {
        status = 429;
        return send(response, 429, '{"error":"BRIDGE_STRATZ_LIMIT"}');
      }
      const answer = await cached(key, () =>
        upstream('https://api.stratz.com/graphql', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization, 'user-agent': 'STRATZ_API' },
          body: JSON.stringify({ query })
        })
      );
      status = answer.status;
      return send(response, answer.status, answer.body);
    }
    if (request.method === 'GET' && url.pathname.startsWith('/opendota/')) {
      const path = url.pathname.slice('/opendota'.length);
      if (!OPENDOTA_PATHS.some((pattern) => pattern.test(path))) {
        status = 404;
        return send(response, 404, '{"error":"NOT_ALLOWED"}');
      }
      const target = `https://api.opendota.com/api${path}${url.search}`;
      const hit = cache.get(`opendota:${target}`);
      if (!(hit && Date.now() - hit.at < CACHE_MS) && !allowedNow(opendota, OPENDOTA_PER_MINUTE, OPENDOTA_PER_DAY)) {
        status = 429;
        return send(response, 429, '{"error":"BRIDGE_OPENDOTA_LIMIT"}');
      }
      const answer = await cached(`opendota:${target}`, () =>
        upstream(target, { headers: { accept: 'application/json' } })
      );
      status = answer.status;
      return send(response, answer.status, answer.body);
    }
    status = 404;
    return send(response, 404, '{"error":"NOT_FOUND"}');
  } catch (error) {
    status = error instanceof Error && error.message === 'TOO_BIG' ? 413 : 502;
    return send(response, status, `{"error":"${status === 413 ? 'TOO_BIG' : 'UPSTREAM_FAILED'}"}`);
  } finally {
    console.log(JSON.stringify({ method: request.method, path: url.pathname, status, ms: Date.now() - startedAt }));
  }
});

server.listen(PORT, HOST, () => console.log(JSON.stringify({ listening: `${HOST}:${PORT}` })));
