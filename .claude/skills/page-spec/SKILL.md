---
name: page-spec
description: "Format and mandatory state matrix for specifying an admin page or screen — route, purpose, data, actions, permissions, loading/empty/error/401/403/409/queued/unknown states, focus behavior, responsive and WCAG 2.2 requirements. Use when specifying, designing, building or reviewing a page."
---
# Page spec

A page spec is short text plus a state matrix. Its executable form is the page's component and E2E tests. `docs/PAGE_MAP.md` indexes all pages.

```markdown
## /route — Page name
Purpose: one sentence, who and why.
Title/H1: "<page> — ALEXEEV Studio"; on route change, update the document title and move focus to the H1.
Data: contracts used (PostDto, PageDto<PublicationDto>, …).
Actions: action → endpoint → success result → failure handling → retry safety (safe GET / never for publish).
Permissions: who sees, who acts; what 403 shows (no data).
| State | Trigger | User sees | Actions | Focus |
|---|---|---|---|---|
| loading | first fetch | skeleton matching layout, region aria-busy | none | unchanged |
| empty | 0 items | why + one primary action; "filters hide all" vs "no data" | create / clear filters | unchanged |
| error | 5xx/network | short text + requestId | retry (safe GET only) | message |
| 401 | session expired | redirect to login, cache cleared | — | login H1 |
| 403 | no permission | "Нет доступа" text, no data | back | message |
| 409 | stale revision | local edits kept (WCAG 3.3.7), compare dialog | reload / keep mine* | dialog |
| scheduled/queued | 202 accepted | the returned status label (usually «Запланировано»), never «Опубликовано» | cancel if safe | status (polite) |
| unknown | ambiguous send | «Требует проверки», duplicate-risk warning | resolve manually | message |
Time: show the channel/operator timezone and UTC offset ("14:30 Europe/Chisinau, UTC+3").
Responsive: compact (< 860 px: cards/stacked) and desktop (table/two-pane) layouts; widths to check per `docs/design/UX_SPEC.md` Conventions; no horizontal page scroll down to 320 px.
A11y: heading order; focus after navigation, submit error and dialog close; no drag-only actions (2.5.7); login allows paste and password managers (3.3.8).
Acceptance: Given/When/Then list.
```

Fill every row that applies and mark the others `n/a` explicitly, so a missing state can't be mistaken for a forgotten one. *"Keep mine" overwrites only if the owner approved it for that page.

Canonical status mapping (the only source for labels and status tokens):
| `PublicationStatus` | Label | Token group |
|---|---|---|
| `scheduled` | «Запланировано» | `pending` |
| `queued` | «В очереди» | `pending` |
| `preparing`, `sending` | «Публикуется» | `active` |
| `sent` | «Опубликовано» | `done` |
| `retry_wait` | «Повтор по расписанию» | `retry` |
| `failed` | «Ошибка» | `failed` |
| `unknown` | «Требует проверки» | `unknown` |
| `cancelled` | «Отменено» | `muted` |

Errors show short text plus the `requestId`, never a bare HTTP code. Interaction details are in skill `ui-patterns`.

Before you finish: every matrix row is filled or `n/a`, each action states its retry safety, and every acceptance criterion is testable.
