---
name: api-security
description: "Security rules and review checklist: owner-only auth by Telegram ID (Mini App initData, browser Telegram Login Widget), Bearer sessions, refresh cookie, bot webhook secret and dedup, input/SSRF limits, headers, secrets. Use for auth, webhook or security review."
---
# API security

One identity everywhere: the owner's Telegram ID (`OWNER_TELEGRAM_ID`, a Worker setting). Admin web, Mini App and bot commands accept only it.

## Mini App sign-in (`POST /api/v1/auth/telegram`)
- Verify `initData` per Telegram: secret key = `HMAC_SHA256(key="WebAppData", message=bot_token)`; data-check-string = all fields except `hash`, sorted, `key=value` joined by `\n`; compare hex HMAC with `hash` in constant time (`crypto.subtle.timingSafeEqual` on equal-length digests).
- Require fresh `auth_date` (≤ 15 minutes) and `user.id === OWNER_TELEGRAM_ID`; otherwise 401/403. Never trust `initDataUnsafe`. Never log `initData`.

## Browser sign-in (Telegram Login Widget, `POST /api/v1/auth/telegram-widget`)
- Owner decision 06.10.2026: the classic Login Widget (BotFather → bot → Login Widget domain), the client receives the widget's `auth_user` message from the `oauth.telegram.org` iframe (exact origin and iframe-window check; not `data-onauth`, which needs `unsafe-eval`) and POSTs the user object as JSON. No OIDC client credentials exist for this bot.
- Verify per Telegram: secret key = `SHA256(bot_token)`; data-check-string = every received field except `hash`, sorted, `key=value` joined by `\n`; compare hex HMAC-SHA256 in constant time. Every received field must be hashed: refuse an own `__proto__` key and lone surrogates (both would let a different payload share a signature).
- `auth_date` ≤ 15 minutes, `id === OWNER_TELEGRAM_ID`, Origin = app origin, each hash accepted once (D1 claim in the same batch as the session).
- OIDC (`oauth.telegram.org`, Authorization Code + PKCE, `id` claim — not `sub` — is the user id) may replace the widget later without changing sessions.

## Sessions
- Random 32-byte token from `crypto.getRandomValues`; D1 stores only its SHA-256 hash with Telegram ID and expiry. Access token lives 60 minutes, travels only in `Authorization: Bearer`, and the client keeps it in memory. Mini App renews it with the still-valid token (session ≤ 12 h, then reopen from the bot, because `initData` is accepted only 15 minutes after launch).
- Browser refresh cookie: `HttpOnly; Secure; SameSite=Lax; Path=/api/v1/auth`, 30 days, rotated on use, invalidated on logout. Endpoints that read it require `Origin` = app origin (that is our CSRF defense; the main API never reads cookies).
- Rate-limit sign-in and refresh endpoints.

## Bot webhook (`/webhooks/telegram`)
- The only route without a session. Compare `X-Telegram-Bot-Api-Secret-Token` in constant time. `update_id` is a PRIMARY KEY in D1, so replay is a no-op. Accept only expected update types. Ignore commands and callbacks whose `from.id` is not the owner.
- Respond fast; slow work becomes a D1 job for Cron.

## Input, output, headers
- Parse every body, query and param with `apps/contracts` schemas (`z.strictObject`). Size limits on every route; uploads: size, MIME vs file signature, server-generated keys.
- Outbound fetches only to allowlisted hosts with a timeout (SSRF).
- Errors are `{error:{code,message,requestId}}`, never stack traces or SQL.
- HTML responses: CSP `default-src 'self'`, `frame-ancestors 'self'` plus the Telegram web client origins (confirm the list when implementing); no `X-Frame-Options: DENY` (it breaks the Mini App in Telegram Web); `X-Content-Type-Options: nosniff`; `Referrer-Policy`.

## Secrets and logs
- The owner sets secrets (bot token, webhook secret) with Wrangler; agents never run it. `.dev.vars`/`.env*` stay gitignored. Never put secrets in `VITE_*`, logs, fixtures or reports.
- Logs mask tokens, `initData`, codes and personal data.

## Review checklist
- [ ] Forged, stale (`auth_date` > 15 min) and foreign-ID `initData` are rejected — with tests.
- [ ] `id_token` with wrong signature, `iss`, `aud`, `nonce` or expired is rejected — with tests.
- [ ] Every `/api/v1/*` route except sign-in requires a valid Bearer token; 401/403 leak no data.
- [ ] Refresh/logout with a foreign `Origin` is rejected.
- [ ] Webhook: wrong secret rejected, `update_id` replay processed once, non-owner commands ignored.
- [ ] No secret in the diff, bundle, logs or fixtures.

Sources: `references/sources.md`.
