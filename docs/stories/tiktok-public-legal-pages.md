# Public legal pages for TikTok integration — agent implementation brief

**Status:** implementation requested; **pages are not implemented by this document**.  
**Owner context:** ALEXEEV Studio, existing React SPA + Hono Cloudflare Worker.  
**Scope:** two public, readable legal pages for TikTok Developer Sandbox setup; prepare their content for later production review. No TikTok API/OAuth implementation, new service, database migration, or admin navigation redesign.

## Goal and exact URLs

Create and deploy, in DEV, these two **real pages**, not placeholders or redirects to the dashboard:

| Page | DEV URL | Purpose |
| --- | --- | --- |
| Terms of Service | `https://dev.alexeevs.workers.dev/terms` | Rules for use of ALEXEEV Studio and connected social accounts |
| Privacy Policy | `https://dev.alexeevs.workers.dev/privacy` | Accurate disclosure of data processed by Studio and connected APIs |

These URLs are already entered in the owner's TikTok Developer Sandbox application. The **Web/Desktop URL** configured there is `https://dev.alexeevs.workers.dev`. A later production rollout must use the actual, owner-confirmed public PROD hostname, not assume it is the DEV hostname.

**Critical:** both pages must load without a Telegram sign-in, session, cookies, invite, API token, or owner status. At present, `apps/frontend/src/app/layouts/AppLayout.tsx` sends anonymous users to `/login` except for `BARE_PATHS = ['/login']`. The Worker serves the SPA with `not_found_handling: 'single-page-application'`. Account for both the frontend auth gate and routing/deep-link refresh behavior. Implement either public SPA routes outside the auth gate or truly public static HTML assets, whichever fits the existing architecture with fewer moving parts. Do not weaken auth for admin routes or `/api/v1/*`.

## TikTok requirements that drive this task

- TikTok's app review guidelines require **valid, accessible Terms and Privacy documents**, not an app login page or a generic homepage placed in those fields.
- For a future **Production review**, the configured website itself must be externally accessible, contain real information about the service, and show active links to both legal pages **visibly without expanding a menu**. The DEV dashboard landing at `/` may be owner-gated today, so these two pages alone **do not satisfy the full Production website requirement**. Do not claim production review readiness until a public informational website/landing experience is provided and verified; track that as a separate task unless the owner explicitly broadens scope.
- The TikTok documentation says URL ownership verification is required before production review for apps created after 2024-09-09 (Terms, Privacy, and Web/Desktop URLs). Sandbox without Content Posting API generally does not need that verification yet.
- Official sources (recheck before review):
  - https://developers.tiktok.com/docs/en/app-review-guidelines
  - https://developers.tiktok.com/docs/en/getting-started-create-an-app
  - https://developers.tiktok.com/docs/en/our-guidelines-developer-guidelines

## Content contract: `/privacy`

Use a clearly titled **Privacy Policy — ALEXEEV Studio**, preferably readable English initially (Russian translation is optional if equivalently maintained). Include an **Effective date / Last updated** and **privacy contact**. It must be a genuine description of **what the implemented product actually does**, not generic privacy-policy boilerplate copied from another service.

Required sections and information:

1. **Who operates the service.** Name of the responsible individual/business and a working contact email or contact channel for privacy inquiries. **Owner must supply/approve** the legally accurate operator identity and contact; do not invent a corporation, street address, registration number, or email.
2. **Scope.** ALEXEEV Studio is a content-management/analytics dashboard; explain that TikTok linking is optional and requires authorization by the TikTok account holder. Describe which features exist now, which features are planned, and avoid implying authorization or sync works before it is implemented.
3. **Data categories by source, explicitly and accurately:**
   - TikTok OAuth: account identifiers, profile information returned for approved scopes (`user.info.basic`, `user.info.profile`), account statistics (`user.info.stats`), and public video metadata/metrics via `video.list`; only **if** the account is connected and the endpoint is actually implemented.
   - Tokens/credentials required for API access: handled server-side; never expose access/refresh tokens or Client secret to a visitor, HTML, JS bundle, or policy document.
   - Studio login, content/publication records, technical request/security logs, and any other stored or processed data **only after verifying actual backend behavior**. Do not falsely claim data is not stored or that no logs exist.
   - If YouTube, Telegram, or other providers' data is processed, describe their distinct data sources to the extent relevant to the service and verified in code; do not describe unbuilt integrations as live.
4. **Purposes and basis for processing.** Account connection, displaying a user's content and public statistics, diagnostics/security and any other **implemented** purposes. If the applicable privacy law requires legal bases (e.g. GDPR), obtain owner/legal confirmation and describe them accurately; do not automatically claim consent is the sole legal basis.
5. **Providers and sharing.** Identify relevant providers (e.g. TikTok for account authorization/data; Cloudflare for hosting/storage; Telegram/Google only where actually used). Explain roles and processing facts accurately; do not assert that no third party receives data if infrastructure providers do.
6. **Storage, security, locations and retention.** State what is actually kept (including OAuth tokens, when supported), the retention period or meaningful retention criteria, where it is processed where known, how secrets are protected, and how deletion is handled. Verify code/infra first; **do not invent** fixed durations, countries, encryption properties, or instant-deletion guarantees.
7. **User control and requests.** Explain how to disconnect/revoke TikTok authorization and how to request access/correction/deletion; distinguish a **working in-product disconnect** from manual support if the feature has not been built. Provide the actual support contact and response expectations only if the owner can meet them.
8. **Cookies / authentication / analytics technologies.** Describe cookies or other client-side storage that are really in use, if any; do not add cookie banners or analytics trackers as part of this task.
9. **Age, links and policy changes.** Who may use the service according to applicable rules, external-platform privacy links, and how policy updates will be reflected. Include an accurate effective date.
10. **TikTok-specific transparency.** State the requested permissions in plain language; that public video/profile metrics come from TikTok and may be delayed/incomplete; and that TikTok account authorization can be revoked through the relevant TikTok account settings. Do not represent TikTok as an owner, sponsor, or affiliate of Studio.

**Copy guidance:** plain, concrete English; headings and short paragraphs; avoid terms such as "we never share any data", "all data is encrypted", "we delete everything within 24 hours" unless independently verified. Do not publish bracketed placeholders such as `[your email]` or made-up contact details: an unresolved factual input blocks the legal-copy gate and must be escalated to the owner.

## Content contract: `/terms`

Use title **Terms of Service — ALEXEEV Studio**, last-updated/effective date, the same verified operator/contact, and the following sections:

1. **Service description:** content-management and reporting tools; identify availability/feature limits honestly (TikTok Sandbox integration is under development, not an approved public integration).
2. **Who may use it:** access restricted to authorized Studio users; account holder must lawfully control the social account they connect. Do not publish owner IDs.
3. **Linked platforms and authorization:** connecting a TikTok account is optional; users authorize requested scopes via TikTok; access can be revoked; TikTok's own terms and policies still apply. No false claim of TikTok endorsement.
4. **Acceptable use:** no unauthorized access, scraping beyond permitted APIs, violating copyright, third-party privacy, platform rules, or abusing connected accounts.
5. **User-provided content and rights:** users remain responsible for rights to any content they submit or publish; Studio does not acquire ownership of their uploaded material beyond permissions needed to provide the service, to the extent supported.
6. **Metrics/availability:** third-party data may be unavailable, delayed, limited by scopes/quotas, or inaccurate; reporting is informational and not a guarantee.
7. **Suspension/disconnection:** explain access controls and stopping the service/account link without promising UI functionality not yet implemented.
8. **Service changes, warranties, liability, governing law/disputes:** sensible text appropriate to the operator and target audience, reviewed by the owner/qualified counsel as needed. **Do not invent jurisdiction, legal entity, liability caps, or broad waivers.**
9. **Contact and updates:** a real support/contact route and effective date.

Use realistic language rather than a template with unenforceable terms. The legal operator, audience/jurisdiction, contact, and legal limitations are owner decisions.

## UI and routing requirements

- Two **dedicated** pages, not an image/PDF, modal, empty headings, or HTML that injects a login screen. Semantic `<main>`, a single `<h1>`, scannable `<h2>` sections and readable text; a working link between Terms and Privacy and a link back to Studio.
- Use existing ALEXEEV Studio typography and design tokens and support light/dark where available. Keep the public shell minimal; **no admin sidebar**, private status indicator, authenticated data, redirects to login, or new menu navigation.
- Responsive from 320px to 1920px; no horizontal overflow. Keyboard accessible links, visible focus, adequate contrast and readable line length; page titles set appropriately.
- Route should render correctly for direct navigation, browser refresh, deep links, incognito, Google/TikTok link crawlers and ordinary GET requests; do not depend on client auth initialization.
- Serve `200 OK` with meaningful readable HTML, not `401`, `403`, a Cloudflare challenge, `404`, SPA shell with empty content, or `200` containing the login page. Avoid `noindex` unless a documented product decision specifically needs it.
- Links must be stable across deployments. Use the same paths in PROD when the owner releases to PROD, but **do not deploy PROD or change its TikTok configuration in this task**.
- Existing private routes must remain protected; only explicitly public paths become accessible. No `/api/v1/*` auth relaxation. Do not leak credentials, email other than approved public contact, or internal owner/account information.

## Implementation and acceptance checklist

1. Read the scoped rules: `AGENTS.md`, `apps/frontend/AGENTS.md`, and relevant auth/UI skills; inspect `AppLayout`, route tree generation, Worker asset fallback, and CSP before choosing implementation.
2. Verify all legal-copy facts against current code/infrastructure. Ask the owner for **operator display name, public contact, intended audience/jurisdiction, and factual retention/deletion policy** if not already recorded. Do not hallucinate or ship placeholder text as final legal content.
3. Implement only two public routes and their shared minimal layout/content as needed, using the current React/Worker stack. Avoid new dependencies or an external legal-page SaaS.
4. Test unauthenticated access by GET and browser (incognito), direct load and refresh, responsive widths 320/375/1280, dark/light and keyboard. Ensure `/terms` and `/privacy` do not redirect or flash the private app; `/posts`, `/settings` and all private APIs must still reject anonymous access.
5. Verify both URLs return actual distinct page content and navigate to each other; links don't 404; header/meta title and effective date are present. Do not embed API keys, internal identifiers or tokens.
6. Run `npm run verify:changed` and relevant page/route tests (per repo testing policy); note actual results. Commit the scoped change to `develop` per `AGENTS.md`. Owner handles credentials, production release, and any external legal approvals.
7. After **DEV deployment**, open both exact DEV URLs in a clean browser and report HTTP/HTML/body results. This document's commit alone does **not** make either URL live.

## Completion gate

The task is **DONE** only when both DEV pages are public, show accurate owner-approved content, pass unauthenticated/direct-link and authorization-regression checks, and their exact DEV URLs work in TikTok's app configuration.

The **Production review** remains separate: TikTok also expects a public official site with directly visible links to both pages, URL verification where required, application review, and a functioning end-to-end OAuth demo. Sandbox success is not production approval.
