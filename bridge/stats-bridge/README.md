# Stats bridge

STRATZ refuses Cloudflare's addresses (403) and OpenDota's free tier counts calls per address, which Cloudflare's
shared addresses have always used up (429). `server.js` runs as a free Render web service (owner, 30.10.2026: no card,
sign-in with GitHub) and only forwards. It holds no keys: the Worker sends STRATZ's token in its own `Authorization`
header. It forwards only `POST /stratz/graphql` and an allowlist of OpenDota reads (`GET /opendota/...`), caches good
answers for 10 minutes, keeps OpenDota under 50 calls a minute and 2 800 a day, and packs its answers as tight as it
can: minified JSON, brotli at its best quality for the Worker (which asks `br, gzip`), heroStats 164 KB → 23 KB (gzip:
32 KB). `GET /health` answers `{"ok":true}`.

Why Render: one always-on process with one address (STRATZ allows a token at most 2 addresses per 15 minutes) and no
memory-time billing. Tried and dropped 30.10.2026: Deno Deploy (an organisation without a card gets 1% of the free
plan; 768 MB billed per loaded second ran out in a day) and Google Apps Script (STRATZ answers it with Cloudflare's bot
challenge).

Free-plan limits it keeps under: 750 instance hours a month (one service runs the whole month) and the monthly included
bandwidth; a spent bandwidth without a card suspends the service for the rest of the month, so the bridge answers 429
`BRIDGE_DAY_TRAFFIC` after 100 MB sent in a UTC day (≈ 3 GB a month) and the collector waits. A free service sleeps
after 15 minutes without requests; the first call after that waits about a minute.

Owner setup (the agents do not create accounts or deploy):

1. render.com → sign in with GitHub → New → Web Service → this repository, branch `develop`.
2. Root Directory `bridge/stats-bridge`, Runtime Node, Build Command `npm install`, Start Command `npm start`,
   Instance Type Free; Advanced → Build Filters → Included Paths `bridge/stats-bridge/**` (other pushes don't redeploy).
3. Create; `https://<name>.onrender.com/health` answers `{"ok":true}`.
4. The Worker: `STATS_BRIDGE_URL` in `apps/backend/wrangler.jsonc` (a plain variable, not a secret) and the Worker
   secret `STRATZ_TOKEN`.

## Spare bridge on Vercel

The same code runs on Vercel's free Hobby plan (no card, sign-in with GitHub) as a spare: `api/bridge.js` is one Node
function every path is rewritten to (`vercel.json`, region Frankfurt). The Worker takes it only while Render is down —
unreachable, a host error page without the bridge's `x-stats-bridge: 1` mark (asleep, suspended), or the bridge's own
`BRIDGE_DAY_TRAFFIC` refusal — and never on a source's own answer
(`apps/backend/src/integrations/stats-bridge/spare-bridge-fetch.ts`). Never a third bridge and never in turns: STRATZ
allows one token two addresses per 15 minutes, so only OpenDota ever falls back to the spare; STRATZ calls stay on Render (owner, 31.10.2026). On Vercel the bridge packs at brotli 5, since the plan counts active CPU
(4 h a month). Risk: Vercel functions may leave from more than one address; if STRATZ then refuses (403), the collector
pauses for 30 minutes and tries again.

1. vercel.com → sign in with GitHub → Add New → Project → this repository.
2. Root Directory `bridge/stats-bridge`, Framework Preset «Other», no build or output settings → Deploy.
3. Settings → Git → Production Branch `develop`; Settings → Build and Deployment → Ignored Build Step «Only build if
   there are changes in a folder» (this folder). `https://<project>.vercel.app/health` answers `{"ok":true}`.
4. The Worker: `STATS_BRIDGE_URL` becomes `https://<render>.onrender.com,https://<project>.vercel.app` (main first).

An update deploys itself on a push that touches this folder. Logs are on the service's Logs tab (method, path, status
and time only).
