# Dota watchlists — UX handoff

Status: `UX_READY` for a clickable mock; expert review, not validated with users. This extends the accepted `/sources` read-only Dota slice and does not broaden its data sources. Owner words and the existing Dota MVP story are the product evidence. No owner screenshots were supplied; use the approved `/__proto/sources` design and its accepted update-detail prototype as the visual reference. Do not reproduce fictional preview events or imply unavailable backend capabilities.

## Audit

| Screen | Step | Heuristic | Evidence | Severity | Fix |
|---|---|---|---|---:|---|
| `/sources` | Add a watch | Visibility of system status; error prevention | `docs/stories/dota-intelligence-mvp.md:44`; `docs/design/UX_SPEC.md:213` | 3 | Offer «Следить» only on a parser-confirmed hero/item fact; show confirmed result and an already-watched state. |
| `/sources` | Remove a watch | User control and freedom; consistency | `docs/stories/dota-intelligence-mvp.md:96`; `docs/design/UX_SPEC.md:213` | 2 | Put a named «Не отслеживать: …» action on its row; no confirmation for reversible private state, no optimistic success. |
| `/sources` | Inspect a matched update | Match between system and real world; recognition rather than recall | `docs/stories/dota-intelligence-mvp.md:94`; `docs/design/UX_SPEC.md:213` | 3 | Keep match inside the real persisted update row and identify the matched entity; expose only recorded alert outcome. |
| `/sources` | Handle ambiguous alert | Error prevention; help users recognize, diagnose and recover | `docs/stories/dota-intelligence-mvp.md:95`; `docs/design/UX_SPEC.md:213` | 4 | Persistent «Требует проверки» warning; explain duplicate risk; never offer automatic or manual resend from this flow. |

No user validation was performed. Expert review, not validated, based on repository evidence and the owner's stated goal.

## Flow and screen map

Entry points: open `/sources` from the approved navigation/prototype destination; the accepted «Обновления / Источники» tabs remain unchanged. Add a watch from an eligible confirmed hero/item fact in an update detail; remove it from the corresponding row in «Мои отслеживания» in «Обновления». Browser back/forward and the detail URL continue to work. Mini App uses Telegram BackButton for exit and keeps the same actions.

1. Read the existing sources and update list. Source health remains in the existing «Источники» tab; the watch panel sits in «Обновления», after its filters and before the bounded update list. No new route or source editor is added.
2. To add, activate the named «Следить за героем: {name}» or «Следить за предметом: {name}» control on a confirmed fact. The action is absent for unconfirmed, unsupported or merely textual entities. While pending, disable only that control. On server-confirmed success, add the watch row and focus it; on conflict/failure, preserve the page and show a recoverable message. Existing watches display «Уже отслеживается» and cannot be duplicated.
3. To remove, open the watch row's «⋯» menu and activate «Не отслеживать: {name}». On confirmed success, remove that row and focus the next watch, or the panel heading if it was last. Leaving the page never blocks. No confirmation is needed for this reversible private setting. An «Отменить» toast is allowed only if the API supports the opposite operation and the result is not represented as successful until confirmed.
4. A confirmed exact match appears inline in the official update feed as «Совпадение» plus the matched hero/item. It is not a synthesized update. The row shows the notification state only from persisted evidence. Definite sent/failure are distinguished; ambiguous or unprovable delivery remains visible as «Требует проверки» / «Статус уведомления неизвестен» and has no retry/resend action.

### Screen/state map

| Screen/region | Purpose and actions | State behavior | Focus/exit |
|---|---|---|---|
| `/sources` source-health region | Inspect two configured official feeds; safe read retry only | Initial skeleton; partial/stale source remains individually labeled with last confirmed time; errors show short text and request ID | Initial route focuses H1; refresh/read retry does not steal focus |
| `/sources` «Мои отслеживания» | View active exact hero/item watches; remove a watch; no add-anything search until supported entities are provided | Empty: «Вы пока ничего не отслеживаете» and link/action back to confirmed update facts; loading skeleton; 409 shows current server state and requires explicit retry; mutation error preserves data and provides retry only for the idempotent operation | After add focuses new row; after remove focuses next row or panel heading; route can always be left |
| `/sources?update={sourceKey}:{externalId}` detail | Read confirmed fact and add eligible exact hero/item watch | Existing detail states remain per UX spec: complete/incomplete/no-recognized/pending/not-applicable/unavailable; add is unavailable unless entity eligibility is confirmed | Detail heading on deep link; browser back removes only update query and restores opener; Mini App BackButton |
| `/sources` update/match feed | Inspect official persisted update and matched watch/alert outcome; open source or existing draft only | Empty vs filtered empty remain distinct; match only when exact persisted match is proven; ambiguous alert is persistent unknown and not retryable | Match update link keeps accessible name; leaving has no unsaved state |

## State matrix

| State | Trigger | User sees | Actions and retry safety | Focus |
|---|---|---|---|---|
| loading | First read or watch mutation | Geometry-matched skeleton; region `aria-busy`; mutation pending state limited to affected control | No duplicate submit; GET retry is safe; repeat add/remove only if contract guarantees idempotency | Initial H1; mutation focus unchanged |
| empty | Successful response, no watches / no updates | «Вы пока ничего не отслеживаете» / «Новых официальных обновлений нет»; distinguish empty watch list from empty feed | Navigate to a confirmed fact or safe read refresh | Empty-state heading |
| filtered empty | Existing updates but active view/filter hides them | «Нет обновлений по этим фильтрам» | Clear filters only; no mutation | Filter summary |
| error | Network/5xx read or mutation | Short Russian explanation and `requestId` if present; cached read data explicitly stale; mutation result not claimed | Retry GET safely; retry a mutation only under the operation's idempotency contract; never resend an alert | Error summary/message |
| offline | Connection lost | Persistent «Нет соединения. Данные могут быть устаревшими.»; mutations disabled with reason | No offline queue; reconnect then safe read | Focus remains; status announced politely |
| 401 | Session expired after standard reauth | No private Dota data; redirect to login | Sign in again | Login H1 |
| 403 | Owner authorization denied | «Нет доступа к Dota Pulse»; no source, watch, match or alert data | Return to permitted page | Message heading |
| 409 | Watch list revision/state conflict | «Список отслеживания изменился. Проверьте текущее состояние.»; preserve intended entity/action locally without claiming it succeeded | Reload current state; owner explicitly invokes add/remove again; safe only if API defines idempotency | Conflict message, then affected action on explicit retry |
| queued | No queued watch operation in this UI | n/a | n/a | n/a |
| unknown | Telegram alert could have been delivered, or delivery proof is missing | «Требует проверки» / «Статус уведомления неизвестен» with duplicate-risk explanation | No retry or resend. Open existing incident if present; leaving is safe | Warning/message; no modal trap |
| partial/stale | One source failed or data is beyond its freshness threshold | Healthy feed remains visible; failed source has its own status and last successful timestamp; no all-healthy summary | Retry only the read; inspect existing incident | Status warning |

Errors use short text plus `requestId`, never bare HTTP status. Status includes text and a non-color signal. No confirmation modal is used for private watch changes; no public effect is available in this flow.

## Responsive, keyboard and accessibility

- Follow the approved `/sources` Panel and list/card pattern at 375, 1280 and 1920 px; implementation/UI QA runs the full 320, 375, 390, 768, 1024, 1280, 1440 and 1920 px matrix. Under 860 px, stack each watch and match into card rows; do not hide metadata or actions. Keep actions out of hover-only menus; target size is at least 44 px for touch/Mini App.
- Heading sequence remains H1 then region headings. Buttons are native buttons; navigation and official/draft/incident destinations are links. Visible labels name the entity and action. Status is not conveyed by color alone. Pending/error states use polite status / blocking alert semantics as appropriate.
- Tab reaches add/remove actions in reading order. Enter/Space activates; Esc closes the row menu and returns focus to its trigger; after submit focus follows the state matrix. No drag-only interaction. Page must not scroll horizontally at 320 px. Pinned Mini App controls respect safe areas and keyboard/visual viewport.
- Watch rows do not use a hand-built ARIA grid. Use existing semantic table/card primitives. The toast is supplementary; persistent watch/match state remains on page. Offline never queues a mutation.

## API needs — clickable mock only until contract exists

1. Owner-only bounded watch DTO: stable watch identity, exact entity kind/name/identity, enabled state, last matched update reference; no client inference from display strings.
2. A supported-entity eligibility signal derived only from confirmed persisted patch facts, plus idempotent add/remove operations and explicit stale-version/conflict semantics. Do not invent a free-text entity search or arbitrary watch terms.
3. Bounded match/update representation tying exact watch identity to a persisted official update/fact, with canonical source reference and existing draft reference only when one exists.
4. Alert outcome tied to the watch-update pair that distinguishes confirmed sent, definite failed, ambiguous/unknown, and unavailable evidence; an incident link only if one exists. Ambiguous is terminal for automatic retry and has no UI resend operation.
5. Retry/idempotency guarantees and response statuses sufficient for honest pending/success/error states. Until supplied, prototype controls mutate mock state only and production UI omits unavailable actions/data.

## Per-image element inventory for ui-prototyper

No owner screenshot exists. These elements extend the approved `/sources` prototype; keep established tokens/primitives from `docs/design/README.md` and `shared/ui`, and do not invent a competing visual style.

| Prototype state/image | Every required element | Token/primitive or API need |
|---|---|---|
| Desktop `/sources` Updates tab, empty watch panel | Existing page H1/subtitle and accepted tabs; «Мои отслеживания» Panel heading; empty message; link to confirmed update facts; update-list Panel; each eligible fact action; footer/stale note. Source-health remains in the separate Sources tab, without duplication. | Existing PageHeader, Panel, Button, Link, StatusBadge. API needs 1–5 |
| Desktop, watches + matched update | Watch row entity name/kind/state, remove overflow action; update row official title/source/time, confirmed fact and match label/entity; recorded alert label/icon; source/draft links only if proven | Existing semantic Table/row/card, MenuButton, StatusBadge, Link. Alert fields API need 3–4 |
| Mobile 375, watches + match | Same information in stacked cards; visible entity/action; match and delivery outcome; touch-sized menu/action; panel headings and footer | Existing compact Panel/card pattern and Button; no hidden fields. API needs 1–5 |
| Loading / read error / offline | Same final geometry skeleton; busy indicator; error message/request ID/retry; persistent offline/stale banner | Existing Skeleton, ErrorState, StatusBadge; safe-read operation |
| Add pending/success/conflict/failure | Fact card entity action; pending disabled state; newly added row; conflict state preserving current server list and intended action; failure with request ID | Button, polite Toast, persistent ErrorState; mutation/idempotency API need 2 and 5 |
| Remove pending/success | Watch row menu with named remove; pending state; row absent only after confirmed result; focus destination shown by interaction | MenuButton, Button, polite Toast; API need 2 |
| Alert unknown | Matched update row and persistent «Требует проверки» warning; exact duplicate-risk explanatory copy; optional existing incident link; explicitly no resend action | StatusBadge/Alert, Link only if API need 4 proves incident |

## Cognitive walkthrough and acceptance

Expert walkthrough (not validated):

| Step | Will owner try it? | Notice it? | Link it to goal? | See progress? | Result |
|---|---|---|---|---|---|
| Add from confirmed fact | Yes: watch named hero/item | Yes: adjacent named button | Yes: exact entity is in its label | Yes: pending, then new row/status | Pass only if confirmed-only eligibility is visible |
| Remove an active watch | Yes: action belongs to that row | Yes: overflow menu is present without hover | Yes: menu names the entity | Yes: row persists pending and disappears only after success | Pass |
| Inspect a match | Yes: official update is already in feed | Yes: «Совпадение» and entity label | Yes: title/source/fact remain together | Yes: alert state is text, not color-only | Pass |
| Recover from ambiguous alert | Yes: persistent warning is visible | Yes: «Требует проверки» is explicit | Yes: copy explains possible delivery/duplicate risk | Yes: status persists and no retry suggests certainty | Pass; no resend |

Given an unsupported or unconfirmed mention, when the owner opens its detail, then no watch-add action is offered. A fact individually returned as confirmed is eligible even if the update parse state is `incomplete`; an unresolved or merely mentioned entity is not. Given an eligible confirmed hero/item fact, when the owner adds it successfully, then one watch row appears and focus moves to that row; a repeated request cannot create a duplicate. Given the owner removes a watch, when the operation succeeds, then the row disappears and focus moves predictably; on failure it remains. Given an exact confirmed match, when its update appears, then it is linked to the real persisted official update and only its recorded alert outcome is displayed. Given an alert outcome is ambiguous or unproven, when the owner inspects it, then it is visibly marked for verification and no retry/resend action is available. Given 401/403/409/network/offline, when each state occurs, then private data and progress follow the matrix above. At 320–1920 px, the owner can navigate, act, leave and recover using keyboard or touch without clipping, horizontal page scroll, or focus loss.

## Comparable interaction conventions

- GitHub separates watching from starring and lets a user unwatch from the watched object; this supports placing the reversible removal action on the watch row rather than a global destructive flow: [GitHub notification configuration](https://docs.github.com/en/subscriptions-and-notifications/get-started/configuring-notifications).
- Gmail offers a bounded «Undo» immediately after a completed send, rather than blocking the ordinary send with a confirmation. Here watch mutations are private/reversible, but notification sending can be ambiguous, so the UI does not imply undo or retry when delivery is unproven: [Gmail Undo Send](https://support.google.com/mail/answer/2819488?hl=en).
- GOV.UK's visible focus treatment demonstrates that focus must remain discernible on every interactive action, including compact row controls: [GOV.UK focus states](https://design-system.service.gov.uk/get-started/focus-states/).

These conventions inform interaction only; ALEXEEV layout, components and tokens remain governed by the approved `/sources` design.
