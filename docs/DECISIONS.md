# Decision log

Accepted decisions that are in force. An agent does not propose an alternative to a recorded decision until the owner raises the question: new facts are filed as a "proposal to revisit" with a reason. Superseded decisions are removed (see Git history); the date is when the current form was accepted.

## Architecture and stack
| Date | Decision | Details |
|---|---|---|
| 03.10.2026 | Modular monolith: one Worker, one D1, Cron (Queue only after measurements); no microservices | `docs/BACKEND_ARCHITECTURE.md` §1 |
| 19.10.2026 | One Queue, `AI_JOBS`, carries the AI writer's model calls (owner; the measurement: GPT-6.1 Sol at its default effort ran past the 30 s of a webhook's `waitUntil`, AI_TIMEOUT on DEV). AI text quality is never traded for speed: no lower reasoning effort to fit a platform limit. The queue never retries; D1 claims each job once. Publishing stays on Cron. Each environment has its own queue (`content-ai-dev`, `content-ai-prod`), created once by the owner | `docs/backend/principles.md`, `docs/backend/bot.md` «AI writer» |
| 03.10.2026 | Strict backend module boundaries: modules do not import each other; only `app/` wires them (ports + `container.ts`); enforced by dependency-cruiser | `docs/BACKEND_ARCHITECTURE.md` §2 |
| 03.10.2026 | Backend stack: Hono + Zod contracts (no RPC/OpenAPI), D1 via SQL without an ORM, grammY for the bot and sending without auto-retry, Vitest 4.1 + Cloudflare plugin | `docs/BACKEND_ARCHITECTURE.md` §1 |
| 03.10.2026 | Frontend stack: React Aria Components + CSS Modules, TanStack Router + Query, React Hook Form, `@internationalized/date`, Vite 8; one Worker serves the SPA and the API | `docs/FRONTEND_ARCHITECTURE.md` §0 |
| 03.10.2026 | Product code in `apps/{frontend,backend,contracts}`; agent infrastructure in `.agents/` | `README.md` |

## Product
| Date | Decision | Details |
|---|---|---|
| 06.10.2026 | ALEXEEV Studio is the full product control plane, not a minimal admin MVP; backend first, then the redesign and the remaining capabilities; browser and Mini App keep feature parity | `docs/PAGE_MAP.md` |
| 03.10.2026 | The admin UI is one SPA: website and Telegram Mini App; no third-party SDK | `docs/FRONTEND_ARCHITECTURE.md` §16 |
| 03.10.2026 | The bot is personal: commands only from the owner; inbound adapter `app/bot` in the same Worker; administrator of the owner's group with minimal rights; collecting data from the group — later | `docs/BACKEND_ARCHITECTURE.md` §2 |
| 07.10.2026 | The end goal is a server that prepares content itself. First step: Phase 1D — watch official Dota sources and turn a new update into a template draft with a private owner alert; publishing still needs owner approval | — |
| 06.10.2026 | Deleting or archiving a post or publication in the admin never deletes the message from the Telegram channel | `docs/BACKEND_ARCHITECTURE.md` §5 |
| 06.10.2026 | Every delete asks for confirmation; post lists (including the Archive) and final publications support bulk delete | `docs/design/UX_SPEC.md` §3.2 |
| 14.10.2026 | Обзор has one fixed widget layout — Лента дня full width, then Неделя + Черновики (replaces the customizable grid of 08.10.2026): no edit mode, catalog or saved layout; the `dashboard_layout` table stays unused | `apps/frontend/src/features/dashboard/model/layout.ts` |
| 14.10.2026 | No global search: the command palette, its top-bar trigger and `Ctrl K` are removed | Posts and Публикации have their own search; navigation is the sidebar and tab bar. Fewer controls in the phone and Mini App header |
| 13.10.2026 | Calendar scheduling requires an explicit first/second occurrence for repeated local times and rejects nonexistent DST-gap times without shifting. | — |
| 13.10.2026 | Pausing an automation stops future automation runs only; already-scheduled Telegram publications remain dispatchable under the publication state machine. | — |
| 13.10.2026 | Platform expansion (uploading videos) starts with YouTube, owner-only OAuth and explicit per-video action; no silent scheduled upload. | — |
| 15.10.2026 | Content analytics first (owner): read-only counters of the owner's own channels. Telegram from the public channel preview `t.me/s/<channel>` (keyless; views and reactions per post, subscribers); YouTube from the Data API v3 with an API key (public counters, 3 of 10 000 free daily units per hourly run; retention needs OAuth later); TikTok through the official Display API with the owner's sign-in in a Sandbox app (built once the owner registers the app), revisiting the 13.10.2026 TikTok deferral for analytics only. Cron collects each source about hourly; snapshots are hourly for an item's first 72 hours, then daily. | `docs/API_CONTRACTS.md` § Content analytics |
| 17.10.2026 | A video's rubric is read from its title (owner): the owner ends every title with «Учу фидить в доту» or «Учусь играть в доту. Часть N», case and small typos aside; a title without either is a video outside the rubrics. A linked AI script still wins; the manual rubric choice is removed from the item panel | `modules/content-analytics/title-format.ts`, `docs/ai/architecture.md` item 1 |

## Publishing and data
| Date | Decision | Details |
|---|---|---|
| 16.10.2026 | No post title: the studio has one text field and a new post sends only its body; the studio name of a post (lists, search, the bot's notices) is the start of the body. Posts created earlier with a title keep it as the bold first line | `docs/backend/cron.md` message format |
| 16.10.2026 | No automatic publication of AI texts: every AI draft reaches a channel only after the owner's «Одобрить» (bot or studio); pre-approval in the request («сам утверди и опубликуй») and automatic posts from news stay off until the owner is sure the writer writes well | `docs/ai/architecture.md` item 20 |
| 18.10.2026 | A post is text (with optional media) or a native Telegram poll, fixed at creation; a poll has no body or media and is always anonymous (channels require it). Every post carries send options — silent, protected content, link preview — edited on the publish step and snapshotted with the approved revision. Supersedes the 09.10.2026 «no notify switch» note for these three options; pin and comments stay out | `apps/contracts/src/post-poll.ts` |
| 03.10.2026 | `unknown` from Telegram — manual reconciliation only, never an automatic retry | skill `publishing-reliability` |
| 13.10.2026 | Retention: purge terminal-job attempts after 90 days only when no open incident exists; purge resolved incidents 365 days after resolution; purge audit rows after 365 days. Open incidents and attempts for active jobs are never purged. Hourly Cron deletes at most 100 rows per table. | `docs/BACKEND_ARCHITECTURE.md` §10 |
| 14.10.2026 | Hero statistics (OpenDota) removed: its keyless API answers 429 to Workers' shared egress IPs. A new source needs an owner decision; the `dota_hero_stats_*` tables stay unused. | — |
| 13.10.2026 | (superseded 14.10.2026) Hero Movers may use OpenDota `/heroStats` as community-derived, best-effort data with source attribution, sample counts, observation/freshness times, bounded no-key polling and no paid tier. Never label it Valve data; current API data-reuse terms and service limits are not established by the reviewed sources. | — |
| 13.10.2026 | Dota cosmetics scope is limited to official announcement title/time/link already available through source feeds; no article scraping, item catalog, third-party catalog or copied artwork until an authorized structured source is established. | — |
| 13.10.2026 | Analytics v2 uses manual observations/import only; no MTProto user session or new Telegram-user credential in the Bot API Worker. Measurements must carry metric, source, content age and observation time. | — |
| 06.10.2026 | Stale draft revision travels in the request body; a stale one is 409 `CONFLICT` with `details.reason = STALE_REVISION` (no `If-Match` / 412) | `apps/contracts/src/posts.ts`, `docs/API_CONTRACTS.md` |
| 08.10.2026 | Post approval stores an immutable content snapshot; publication sends exactly that snapshot; the revision number guards against stale edits | — |
| 17.10.2026 | A post is never sent to the same channel twice at once: while one publication of it there is scheduled, queued, being sent or unknown, a second is refused (`ALREADY_PUBLISHED`, from the bot and the Studio alike). After a sent one the owner may publish it again on purpose (delete, fix, repost); the Studio asks first | `docs/API_CONTRACTS.md` publications |

## Auth and security
| Date | Decision | Details |
|---|---|---|
| 03.10.2026 | A single identity — the owner's Telegram ID; Mini App — `initData`; token in memory, `Authorization: Bearer` | `docs/BACKEND_ARCHITECTURE.md` §8, skill `api-security` |
| 06.10.2026 | Browser sign-in: classic Telegram Login Widget (no OIDC: BotFather gives no client credentials for this bot). The page listens for the widget's `auth_user` postMessage from `oauth.telegram.org` with exact origin/source checks (not `data-onauth`, which needs `unsafe-eval`); the server verifies the hash, one-time use | `docs/API_CONTRACTS.md`, skill `api-security` |
| 05.10.2026 | Secret scanning: full-history Gitleaks with `.gitleaks.toml`; placeholders in docs/tests; false positives only by narrow path + pattern rules, never commit-SHA fingerprints | `.gitleaks.toml`, `README.md` |
| 03.10.2026 | No paid AI/render APIs and no paid plans without a separate owner decision | `AGENTS.md` |
| 13.10.2026 | Automated media pipeline is approved only as a later separate project after manual media, sources and platform publishing are stable; this does not authorize paid providers, render tiers or automatic publishing. | — |

## Design
| Date | Decision | Details |
|---|---|---|
| 03.10.2026 | Figma is excluded entirely (reaffirmed 07.10.2026, including picking templates); design lives only in code | `docs/design/README.md` |
| 14.10.2026 | Visual direction: Cloudflare-dashboard look (full-width content, hairline borders, layered greys, segmented tabs, saturated blue primary); `/__proto` prototype removed; `UX_SPEC.md` stays the source for flows and states | `docs/design/README.md`, `design-refs/нравится/` |
| 14.10.2026 | Appearance: 6 themes for both modes — «Telegram» (blue), «Полночь» (violet), «Dota» (red), «Бумага» (orange), «Лес» (green), «Графит» — each an accent plus tinted backgrounds and surfaces (except the default «Telegram», which keeps the neutral Cloudflare-like surfaces), and «Своя» (one custom accent on neutral surfaces, contrast derived automatically); mode light/dark/auto; no density setting (removed by the owner the same day); everything saves immediately (replaces the 8-accent palette the same day; stored ids unchanged, teal/pink stay valid but are not offered) | `docs/design/README.md` |
| 07.10.2026 | A top-bar button toggles light ↔ dark and saves at once; accent changes need an explicit Save; Settings is master/detail; bot status lives on the dashboard | `docs/design/UX_SPEC.md` §3.6, §4.5 |
| 03.10.2026 | Documentation and agent instructions are in English; the owner is addressed in Russian; UI copy is Russian | `AGENTS.md` |

## Process and environments
| Date | Decision | Details |
|---|---|---|
| 14.10.2026 | Git: agents commit and push to `develop` or branches from it; `main` is forbidden for agents (release PR `develop → main` by the owner)| `AGENTS.md` § Git |
| 14.10.2026 | CI deploys after green checks: `develop` → Worker `dev`, `main` → Worker `app`; each environment owns its D1 and vars; DEV applies pending D1 migrations automatically before the deploy, production migrations stay a manual owner run (replaces 05.10.2026 «remote migrations manual») | `.github/workflows/ci.yml`, `apps/backend/wrangler.jsonc` |
| 07.10.2026 | Everything is tested only in DEV; production is not prepared or released until the owner says DEV is ready | — |
| 03.10.2026 | Uniform code style: Prettier + Oxlint via Husky/lint-staged on commit, `verify:changed` on pre-push, full `verify` in CI | `README.md` |
| 16.10.2026 | The AI writer is used mainly from the Telegram bot in plain words («напиши пост в тг про …»); an AI text becomes a studio post only after the owner's approval. The owner may pre-approve in the request itself («сам проверь, утверди и опубликуй в 18:00»): then a draft that passes the code checks is approved as owner-pre-approved and scheduled to the default channel, with the usual schedule notice to edit or cancel; a draft that fails the checks is sent for review instead | `docs/ai/architecture.md` |
| 19.10.2026 | «Учусь играть» AI scripts never contain the opener «Учусь играть в Доту» or the ending «подпишись, заебал»: the owner says both himself in every video, so the model must not spend tokens on them. The rubric examples are given to the model without these lines (`withoutIgratFixedLines`); a draft that still has them gets the code check `IGRAT_FIXED_LINES` | `docs/ai/pack/format-uchus-igrat.md`, `apps/backend/src/modules/ai/writer-checks.ts` |
| 19.10.2026 | Owner: what the AI must not write is cut from what it learns from, not forbidden by more rules. The Gaben medal is the author's own verdict: medal sentences are removed from the «Учусь играть» and Telegram examples the model sees (`withoutGabenMedal`), the format rules no longer mention a medal, and a medal the task never named gets the code check `MEDAL_INVENTED`. The rubric opener and «подпишись» likewise rely on stripped examples and the `IGRAT_FIXED_LINES` check, without a rule line | `apps/backend/src/modules/ai/writer-prompt.ts`, `writer-checks.ts` |
| 19.10.2026 | A Telegram post about a patch or update is news retold in the owner's voice, not a one-line caption: 300–600 characters (owner: a short comment stays under 100; a post about someone or something is longer, but not much), the main change first with a reaction, 2–4 key changes from the task with what they mean in a game, jokes only about the changes, ending with a question to subscribers or the link from the task. A short caption only when the owner asks for one. The same rule will serve news posts made from sources | `docs/ai/pack/format-telegram.md` |
| 15.10.2026 | AI provider: OpenAI (one key for text and, later, images; no fine-tuning: OpenAI no longer opens it to new users). The exact model is picked when the key exists (verified on OpenAI's site, cheapest that holds the voice); the provider stays behind one port. Replaces the Claude choice of 14.10.2026 | `docs/PLAN.md` stage A |
| 15.10.2026 | Hero media: Cron never asks Valve for the hero list or for files it did not have; the owner presses «Проверить у Valve» in «Медиа → Герои Dota» when a hero is released. Cron only copies queued files and retries failures. No Queue for this | `docs/API_CONTRACTS.md` § Dota hero assets |
| 15.10.2026 | Deleting a media file is never blocked by its crops: the dialog warns where the file is used and that its crops stay in «Медиа» as files of their own; only a publication being sent or unconfirmed still blocks | `apps/contracts/src/media.ts` (usage) |
| 15.10.2026 | Content alert look chosen by the owner: weekly digest as a numbered list (platform by name, title, views; no ratios) with a studio button per publication; «Залетает», «Идёт слабее обычного» and source alerts as cards; a weak item shows no ratio; titles never show hashtags | `docs/API_CONTRACTS.md` § Content analytics |
| 15.10.2026 | The bot's menu button shows the command list instead of opening the studio: the owner wants to see the commands; the studio opens from /start | `docs/backend/bot.md` |
| 03.10.2026 | Agents: one source for Claude Code and Codex (`.agents/` → generated adapters); work only by project roles; built-in read-only helpers allowed; generic global agents denied in `.claude/settings.json` | `docs/AGENT_ORCHESTRATION.md` |
| 09.10.2026 | Owner reference images are reproduced visually exactly (composition, element shapes, sizes, spacing) using our colours, fonts and components; a shape our system lacks becomes a new primitive variant or token, never local CSS | `docs/AGENT_UI_WORKFLOW.md` § Reference fidelity |
| 14.10.2026 | Token economy is the top cost rule: the main session works itself, subagents only for parallel halves, research or R3 review; no prototype/ui-qa stages; tests only for critical paths (replaces the 09.10.2026 multi-role UI workflow) | `AGENTS.md`, skills `orchestrate`, `testing` |
| 14.10.2026 | Deleting a post (owner delete and the archive purge) keeps what was sent: a post with a succeeded publication is soft-deleted (`posts.deleted_at`, migration 0041), so its sent publications, jobs, attempts, incidents and sent revision stay visible in «Публикации» with the badge «Пост удалён», a snapshot preview and the Telegram link; the post itself is hidden everywhere and never purged again. Posts without a sent publication are still hard-deleted. | `docs/backend/post-lifecycle.md` |
| 14.10.2026 | Times are shown in the owner's zone without the zone name or UTC offset; the zone is visible only in Settings | skill `ui-patterns` |
| 14.10.2026 | A media file can always be deleted after a warning listing what it affects (not while a publication is being sent); «Скрыть из медиатеки» is removed | `docs/API_CONTRACTS.md` media |
| 09.10.2026 | Owner reference images in `design-refs/<task>/` are committed so Claude Code, Codex and all agents share them | `design-refs/README.md` |
| 09.10.2026 | Publication screen ships without the «Дополнительные настройки» switches (comments, notify, pin) in the prototype and the real UI; revisit as a separate owner decision (notify: see 18.10.2026 in «Publishing and data») | — |
| 03.10.2026 | Token-saving tools (RTK, caveman proxy, claude-context, context-mode) are not used: measured gains were negligible or they send code to external services | — |

## Awaiting owner decision
| Question | Default recommendation |
|---|---|
| Text generation via AI | not in the MVP |
| Dota 2 patch posts published without owner confirmation | after the MVP; until then patch posts go through owner confirmation, no paid AI/render APIs |
| Session lifetime | token 60 min; Mini App ≤ 12 h; refresh cookie in the browser 30 days |
| Publication status labels | table in skill `page-spec` |
| Repeated `Idempotency-Key` with a different body | 409 `CONFLICT` with `details.reason` |
