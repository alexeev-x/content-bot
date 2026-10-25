# Stats bridge

STRATZ refuses Cloudflare's addresses (403) and OpenDota's free tier counts calls per address, which Cloudflare's
shared addresses have always used up (429). `main.js` runs on Deno Deploy's free plan (no card, sign-in with GitHub;
owner, 25.10.2026) and only forwards. It holds no keys: the Worker sends STRATZ's token in its own `Authorization`
header. It forwards only `POST /stratz/graphql` and an allowlist of OpenDota reads (`GET /opendota/...`), caches good
answers for 10 minutes per instance and keeps OpenDota under 50 calls a minute and 2 800 a day per instance.
`GET /health` answers `{"ok":true}`.

Owner setup (the agents do not create accounts or deploy):

1. dash.deno.com → sign in with GitHub → New Playground.
2. Replace the playground's code with `main.js` and Save & Deploy.
3. Settings → rename the project (e.g. `alexeev-stats`); the address becomes `https://alexeev-stats.deno.dev`, and
   `https://alexeev-stats.deno.dev/health` answers `{"ok":true}`.
4. The Worker: `STATS_BRIDGE_URL` in `apps/backend/wrangler.jsonc` (a plain variable, not a secret) and the Worker secret
   `STRATZ_TOKEN`.

An update is pasting `main.js` again. Logs are on the project's Logs tab (method, path, status and time only).
