# Automation Center — UX handoff

Status: UX_READY. Expert review, not validated with users. This is an operator control plane for existing deterministic work, not an automation builder.

## Scope and evidence

Owner-approved pause rule (13.10.2026, `docs/DECISIONS.md`): pausing blocks future automation runs only. It does not cancel or suspend already-scheduled Telegram publications; publication dispatch remains governed by its own state machine. The old preview statement that pausing the publication queue stops scheduled posts is incorrect and is replaced in `docs/design/UX_SPEC.md` §6.3 D.

MVP is limited to actual bounded recurring work already defined in `docs/plan/sources-automation.md` and the plan: official Dota source polling/patch ingestion, the approved hero-statistics refresh, and owner watchlist evaluation. Render only jobs actually registered by the server; do not invent cadence, health or counts. Source polling may persist facts; patch ingestion may create an owner-review draft and a private owner alert; watchlist evaluation may produce a deduplicated private alert; statistics refresh stores a bounded snapshot. These are private/persisted data effects, never public publishing. No rule/cadence editing, creation, AI, or auto-publishing.

`Run now` is available only for a safe registered task. It requests the normal bounded worker path and D1 claim; a running/queued task is coalesced, never duplicated. It never calls Telegram send or publication dispatch directly. It cannot bypass a scheduled/in-flight claim, source limits, validation, deduplication, or error/unknown handling. If the server cannot guarantee this, do not expose the action.

## Audit (expert review, not validated)

| Screen / step | Heuristic | Evidence | Severity | Finding and fix |
|---|---|---|---:|---|
| `/preview/automations`, pause publication queue | Match between system and real world; error prevention | `docs/design/UX_SPEC.md` §6.3 D (old text) | 4 | Says scheduled posts stop, contrary to decision 13.10.2026 and publication state machine. Replace with explicit notice that scheduled publications continue dispatching. |
| Automation list, switch off | User control and freedom; visibility of system status | `docs/design/UX_SPEC.md` §6.3 D | 3 | Generic switch/dialog hides which future work is affected and what remains running. Name the automation, confirm only pause, then persist status and report whether current run continues. |
| Run now in row menu | Error prevention; consistency | `docs/plan/sources-automation.md` §3.7; existing Dota source and hero-statistics flows | 4 | Unclear idempotency / side effects risk duplicate work or accidental publication. Enable only when safe, route through normal D1 claim, coalesce active run, explicitly disclose private alert/draft side effects and exclude publishing. |
| Automation detail and history | Recognition rather than recall; visibility | `docs/PAGE_MAP.md` `/automations`, `/jobs`; no automation DTO exists | 3 | Existing navigation promises detail, source, cadence, history, yet no contract is present. Show only server-confirmed values and log state; list missing operations under API needs. |

## Flow and page spec

### `/automations` — Automation Center

Purpose: inspect and safely control existing recurring source/statistics/watchlist work. H1: `Автоматизации — ALEXEEV Studio`. Entry: desktop primary navigation; phone `Ещё` sheet. Exit: persistent app navigation; browser Back returns to the previous route. No unsaved form state.

Data: new owner-only `AutomationSummaryDto` + paginated run history DTO (API needs below); source/event/draft/alert links only where existing persisted records are returned. Display all timestamps as `Europe/Chisinau (UTC±offset)` plus absolute date/time; do not infer next run while paused or when the server does not provide it.

Desktop: one page, compact health summary and one table. Columns: name and purpose; category; source/output; cadence (server text + UTC schedule if available); next run; last run/result/duration; state; row menu. Selecting a row opens a 400 px inspector with tabs `Обзор` and `Запуски`; detail includes scope, visible side effects, safe limits, latest result/error and `Запустить сейчас` only when available. Avoid a separate configuration tab: configuration is read-only and editing is out of MVP.

Phone (<860 px): summary stacks above automation cards. Each card shows name, state, last result/time, next run/cadence and a 44 px `Приостановить` / `Возобновить` button. Tap card opens a full-height sheet with the same overview/history; keep the sheet's close button visible and Esc/back closes it. No hidden table columns, hover-only menus, or horizontal page scrolling (320–1920 px).

Primary action: `Запустить сейчас` on a selected safe automation. Secondary actions stay on that row/detail: pause/resume, open run history. The pause switch/button must not silently mutate on first tap: activating pause opens a confirmation dialog, activating resume is immediate. Do not implement an undo toast for persisted scheduler state; resume is the explicit recovery action and accurately states the next server-provided run.

Pause confirmation copy: title `Приостановить «{name}»?`; body `Новые запуски этой автоматизации будут остановлены. Уже начатый запуск продолжится. Запланированные публикации в Telegram продолжат отправляться по расписанию.` Buttons `Приостановить автоматизацию` and `Оставить включённой`. If the current run can be cancelled safely in a future version, that is a distinct capability and confirmation, not implied by Pause.

After pause: update state only after server confirmation; announce `Автоматизация приостановлена. Запланированные публикации продолжают отправляться.` Focus returns to the triggering control, now named `Возобновить`. On server rejection keep prior state and show persistent error with request ID and `Повторить` only if the command is safe/idempotent. On success resume: `Автоматизация возобновлена. Следующий запуск: {server time}.` If no next run is supplied: `Автоматизация возобновлена; время следующего запуска пока неизвестно.`

`Run now` side-effect disclosure adjacent to the button: `Запуск использует обычную очередь и защиту от повторов. Он не отправляет публикации. Для источников могут появиться новые факты, черновик на проверку и личное уведомление; для списка наблюдения — личное уведомление.` Tailor text to the automation's actual effects from DTO, never show effects it cannot produce. Confirmation is not required for a safe idempotent request, but first activation requires a readable description; while queued/running, disable the action and show `Уже выполняется` with the existing run link. Success is `Запуск поставлен в очередь` (not completed); show run ID/link and live status. If coalesced, say `Этот запуск уже запрошен` and link to it.

Publication boundary: never include `Очередь публикаций` as a stoppable automation in this MVP. If infrastructure exposes publication dispatch in the list, show a separate non-interactive note `Публикации, уже запланированные в календаре, отправляются по расписанию независимо от паузы автоматизаций.` No pause, run-now, retry, cancel or dispatch action for publication jobs on this screen. Manage them only in `/publications` / `/calendar` under their existing state machine. This keeps the owner decision visible without adding a control that can interrupt or duplicate public sends.

Permissions: only authenticated owner whose Telegram ID passes server session verification may read or act. 401 follows shared login/clear-session behavior. 403 reveals no automation data. No roles, guest or Mini App capability differences; browser and Mini App have parity.

### State matrix

| State | Trigger / display | Available actions | Focus / recovery |
|---|---|---|---|
| Loading | First safe GET; skeleton summary + 5 cards/rows; region `aria-busy=true` | None | Preserve route focus; announce loaded heading when ready. |
| Empty | Server confirms no registered supported automation | Explain `Пока нет доступных автоматизаций.` No create CTA (authoring is out of scope). Link to `История запусков` only if an existing job exists. | H1 remains focus; no dead-end modal. |
| Loaded | Server-backed rows, text status plus icon/shape; stale/unknown freshness explicit | Open, safe run-now, pause/resume per DTO capabilities | Navigation opens detail; action result is announced. |
| Error / offline | Safe GET fails; retain no stale action controls unless cache is explicitly marked stale/read-only | `Повторить загрузку` (safe GET); `Назад` | Focus error heading; include request ID. |
| 401 | Session expired | Re-authenticate | Clear owner data; focus login H1. |
| 403 | Not owner | `Вернуться` | Show no data; focus message. |
| 409 | Pause/resume raced with another request or stale revision | Refresh state; don't automatically replay a non-idempotent command | Focus conflict message; retain detail route. |
| Queued/running | Run-now accepted or coalesced | Open the existing run; no second run action | Polite status live region; action disabled until server returns safe eligibility. |
| Failed | Run completed with error | Open run details; retry only when server DTO explicitly says retryable and normal claim makes it safe (retry is outside first MVP) | Focus result, show short error + request/job ID; no raw payload. |
| Unknown result | A request outcome is ambiguous | Inspect run; never duplicate or auto-retry | Persistent `Требует проверки` warning and focus; distinct from failure. |
| Paused | Confirmed state | Resume; inspect past runs | Text label plus icon; published queue note remains visible in detail. |
| Partial / stale | One task/source is unavailable or server snapshot is old | Inspect available rows; safe GET retry | Per-row freshness and source; do not mark the whole screen healthy. |
| Double submit | Pause/run action pending | Ignore repeated activation; don't optimistically flip state | Keep pending label and focus; one request ID. |
| Long text | Long source/rule/error label | Open detail; wrap/clamp with accessible full text | No clipped controls; labels available to assistive tech. |
| n/a | 202 accepted for public publication | Not an Automation Center action; publishing excluded | N/A by product boundary. |

### Keyboard and accessibility

Use links for navigation and buttons for actions. Heading order H1 → section H2 → card/table headings. Table uses caption and scoped headers; phone uses labeled cards. Native buttons/selects, visible state text, `aria-describedby` for cadence/effect text, minimum 44×44 px touch targets. Do not rely on color. Confirmation uses shared alert dialog, initial focus on `Оставить включённой`, Escape cancels, focus returns to trigger. Detail sheet has labeled close, traps focus while modal, Escape closes and returns focus. Tabs use arrow keys; Tab exits. After route change focus H1; after command focus initiating control and announce server-confirmed result; errors stay persistent and focusable. Respect reduced motion.

### Acceptance (Given / When / Then)

1. Given a paused source-import automation, when the owner inspects it, then the UI states that future runs are paused, any in-flight run continues, and already-scheduled Telegram publications still dispatch.
2. Given an active automation, when the owner confirms Pause, then only future runs are prevented, UI changes only after server confirmation, audit status is visible, and scheduled Telegram publications are unaffected.
3. Given Pause is pending, when the owner presses the trigger again, then only one command is sent and prior confirmed state remains visible until response.
4. Given an automation has a queued/running run, when the owner chooses `Запустить сейчас`, then the action is disabled or coalesced to that same run; no second D1 claim/work is created.
5. Given the owner starts a source/watchlist run, when the result creates a draft/private alert, then the screen reports those specific side effects with links; it never states that a publication was sent.
6. Given a run-now request succeeds asynchronously, when the API returns 202, then UI says `Поставлен в очередь`, gives its job ID and safe status link, and does not claim completion.
7. Given run-now outcome is unknown or a retry is unsafe, when the owner revisits the detail, then no retry/run button is offered and the duplicate-risk warning remains visible.
8. Given publication dispatch appears in backend inventory, when automation rows render, then that item is not controllable here and the page explicitly says scheduled publications continue independently.
9. Given 401, 403, 409, network failure, stale data or partial source failure, when the page renders, then each state matches the matrix, sensitive data is not exposed and only safe recovery is available.
10. Given 320, 375, 860, 1280 and 1920 px viewports, when the owner navigates and operates keyboard/touch controls, then labels/actions remain visible, targets are at least 44 px, no horizontal page overflow occurs and focus is never lost.

## API needs (no existing automation DTO/route)

- Owner-only paginated `GET /api/v1/automations` and `GET /api/v1/automations/:id`, returning only registered supported work, server-authoritative status/cadence/next run/freshness, actual side-effect declarations, run eligibility, revision and permission-safe error codes.
- `GET /api/v1/automations/:id/runs` paginated, with bounded safe error, job/run ID, timestamps, duration, result, retryability/unknown state and links to persisted output IDs.
- Conditional owner-only `POST /api/v1/automations/:id/pause` and `/resume` with expected revision/idempotency. Pause prevents future claims but does not stop an in-flight run or publication dispatch; audit every accepted change.
- Safe `POST /api/v1/automations/:id/run-now` returns 202 + existing/new run ID; must use exactly the ordinary D1 claim, idempotency/coalescing, limits, timeout and dedupe; reject paused/unsafe tasks; never invoke Telegram send. Error/unknown must not lead to retry-by-default.
- Do not expose cadence/configuration mutation, automation CRUD, retry endpoint, arbitrary queue controls, publication-dispatch controls, secret/raw payload fields, or AI fields in this MVP.

## Comparable-system evidence

- The selected Cloudflare D1 `batch()` API runs prepared statements sequentially as one transaction, which supports recording a run claim and its audit state atomically: [Cloudflare D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/).
- SQLite `UNIQUE` constraints provide the durable conflict boundary needed to coalesce a repeated run request instead of creating a second run: [SQLite CREATE TABLE](https://www.sqlite.org/lang_createtable.html).
