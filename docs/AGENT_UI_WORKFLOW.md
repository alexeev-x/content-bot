# Autonomous UI delivery workflow

**Owner decision, 09.10.2026.** Applies to substantial screens, flows, redesigns and UI tasks with owner-supplied screenshots. Complements skill `orchestrate`; does not add AI features to the product.

## Core rule

Main-session Orchestrator coordinates: **UX Designer → clickable UI prototype → independent UI QA → production frontend/backend → independent implementation UI QA**, with risk-based `qa-security` additionally for R2/R3. Routine UI work is accepted autonomously after proven QA; **do not require owner approval by default**. Invite optional owner preview, but stop for explicitly requested owner review or a new policy/authorization/spending/public-publishing decision. Simple copy or mechanical changes can bypass the prototype.

## Stage gates and responsibilities

| Gate | Owner | Required output |
|---|---|---|
| Triage | Orchestrator; product-analyst only if unclear | scope, risk, acceptance, assigned paths, accessible reference manifest |
| `UX_READY` | ux-designer | navigation, every meaningful state, exit/cancel/undo, responsive plan, API needs |
| `PROTOTYPE_READY_FOR_UI_QA` | ui-prototyper | working mock-only route in existing `/__proto`, fixtures, screenshots |
| `PROTOTYPE_PASS` | independent ui-qa | evidence-backed interaction, visual-layout and accessibility verdict |
| Implementation | contract owner then backend/frontend on disjoint paths | feature matching frozen accepted prototype, focused tests |
| `IMPLEMENTATION_PASS` | independent ui-qa | real screen matched to accepted prototype revision, behavior tests |
| Security/integration gate | qa-security if risk R2/R3 | full `npm run verify` and applicable data/publishing/security tests |
| Delivery | Orchestrator | passed/failed/not_run per criterion, routes/screenshots, actual commands, open risks |

The UI prototyper cannot touch `apps/frontend/src/features/`, production routes, backend/contracts, shared tokens or primitives. Only `design-system` may edit shared primitives. Prototype is demo-only and never performs a real upload/save/publish; all visible controls work in mock state, no fake production capabilities. Backend may begin after a stable contract while prototype work continues; frontend feature implementation waits for `PROTOTYPE_PASS`.

## Reference and acceptance sources

Order: security/publishing safety and actual contracts → approved `docs/design/UX_SPEC.md` and `docs/design/README.md` → task UX/accepted prototype → owner images for layout and interactions. Owner screenshots **do not override application palette, typography or tokens** unless the owner explicitly changes the theme standard.

Each task packet records `reference ID → accessible path → screen/state → required elements`. Images in another chat are NOT guaranteed available to a coding agent. Missing image means reference-specific visual claim cannot pass: request it or mark NOT_RUN; do not invent visual similarity. If no reference was supplied, use the canonical current app design and its approved prototype.

Save accepted prototype **commit SHA + route + fixture IDs + screenshot paths + allowable deviations** in the handoff. Changed design requires a new revision and repeated prototype check. User-facing demo route exists only when the code is actually running; do not invent a live URL.

## UI QA evidence, not opinions

Run a browser with deterministic data. Cover the full viewport matrix in `docs/design/UX_SPEC.md` Conventions (focus state permutations at representative widths); light/dark themes; navigation, errors, offline/loading/empty, media, confirm/cancel, keyboard, scroll, touch/safe areas and screen-reader semantics. Verify accessibility/axe and capture real screenshots. Browser console and network must reveal no unintended requests.

At prototype gate, assess **structure** against owner images and **style** against tokens. At implementation gate, compare the rendered page to accepted prototype screenshots/revision and check real outcomes. Pixel-diff is supportive, not the only test. UI QA must be independent and read-only. Missing browser/reference/testing evidence yields NOT_VERIFIED, never PASS.

Each defect: `UI-001 | gate | severity | screen/state/viewport | expected | actual | evidence | owning role`.
- Missing/awkward action or flow → ux-designer.
- Incorrect clickable mock, layout or mobile composition → ui-prototyper.
- Missing shared token/primitive → design-system through `UI_PRIMITIVE_REQUEST`.
- Real UI differs from prototype or client interactions fail → frontend.
- API/data/upload/publishing defect → backend; change shared DTO through `CONTRACT_REQUEST`.
- R2/R3 integration/security → qa-security reviews and routes to owner.

Orchestrator forwards only the defect, evidence and relevant files to its owner, then UI QA rechecks it and affected flows. Two ineffective rounds or no progress → escalate to owner with alternatives; do not declare completed.

## Task packet example

```text
Goal: Post editor v2 — mixed photo/video and mobile flow.
References: owner images ref01..ref12, accessible paths and screen/state mapping.
UX story: docs/stories/post-editor-prototype.md
Prototype area: apps/frontend/src/pages/prototypes/**; current /__proto shell and themes.
Prototype criteria: add/select/reorder/remove/retry mock media, back/exit and preview; desktop/mobile states.
Gate: independent ui-qa with browser screenshots → PROTOTYPE_PASS.
Implementation: agreed contracts and frozen prototype revision; backend/frontend on disjoint paths.
Finish: UI QA comparison + required risk QA; owner receives evidence, not mandatory approval request.
```

No deployment or merge by agents. Owner controls commits/pushes to `develop` and release `main`. The orchestrator reports in Russian; internal instructions are English.
