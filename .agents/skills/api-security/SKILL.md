---
name: api-security
description: "Security rules and review checklist for the Worker API: admin sessions/cookies, CSRF for JSON mutations, Telegram webhook secret, Mini App initData, input/upload/SSRF limits, headers, secrets, logging. Use for auth, middleware, webhooks, uploads or security review."
---
# API security

## Sessions (admin)
- Use a random session id of 32 bytes from `crypto.getRandomValues`. Store only its SHA-256 hash in D1, so a leaked DB row can't be replayed.
- Cookie: `__Host-session=…; Secure; HttpOnly; Path=/; SameSite=Lax`, with no `Domain` attribute.
- Rotate the id on login and on privilege change. Enforce both an idle timeout and an absolute timeout on the server. Logout deletes the server row.
- One-time login codes have a short TTL, an attempt limit, a per-account and per-IP rate limit, and are never logged.

## CSRF for every mutation (POST/PUT/PATCH/DELETE)
`hono/csrf` alone is not enough. It checks only form and `text/plain` content types, so a JSON POST passes unchecked. Use our own middleware that enforces all three:
1. `Origin` equals the app origin. If `Origin` is missing, accept `Sec-Fetch-Site: same-origin`. If both are missing, reject.
2. `Content-Type: application/json`, which stops simple cross-site form posts.
3. `X-CSRF-Token` equals the token bound to the server session (synchronizer token, issued by `GET /api/v1/auth/csrf`).

`SameSite` is defense in depth only.

## Telegram webhook
- Separate route, no cookie auth. Compare `X-Telegram-Bot-Api-Secret-Token` in constant time: hash both values, then `crypto.subtle.timingSafeEqual`, which needs equal-length inputs.
- `update_id` is `UNIQUE` in D1, so a replay is a no-op. Process only allowlisted update types. Answer 200 fast and move heavy work into a D1 job.

## Telegram Mini App (only when that shell exists)
Validate `initData` on the server: HMAC-SHA256 with the key derived from `"WebAppData"` and the bot token, and check that `auth_date` is fresh. Never trust `initDataUnsafe`.

## Input and output
- Parse every body, query and param with the `apps/contracts` schema (`z.strictObject` for inputs). Never trust client validation.
- Put explicit body size limits on every route. Uploads: check size, check MIME against the file signature, store under a server-generated key, and never use the user's filename as a path.
- Outbound fetches go only to allowlisted hosts with a timeout. Never fetch a user-supplied URL directly (SSRF).
- Errors return `{error:{code,message,requestId}}`. No stack traces or SQL reach the client.
- Set security headers on HTML: CSP `default-src 'self'`, `frame-ancestors 'none'` unless the Mini App needs embedding (then allow Telegram origins explicitly), `X-Content-Type-Options: nosniff` and `Referrer-Policy`.

## Secrets and logs
- The owner sets secrets with `wrangler secret put` per environment (it deploys immediately; agents never run it). `.dev.vars` and `.env*` stay gitignored. Never put secrets in `VITE_*`, logs, test fixtures or reports.
- Logs mask tokens, codes, cookies and personal data. Log a hashed session id at most.

## Review checklist
- [ ] Every admin route has session and permission checks on the server, and 401/403 leak no data.
- [ ] Every mutation has the 3-part CSRF check, with a test proving that a cross-origin JSON POST is rejected.
- [ ] Webhook secret is compared in constant time, `update_id` is deduped, and replay is tested.
- [ ] Inputs are parsed, size-limited and allowlisted; no user-controlled outbound URL.
- [ ] No secret appears in the diff, bundle, logs or fixtures (run gitleaks once it's installed).

Sources: `references/sources.md`.
