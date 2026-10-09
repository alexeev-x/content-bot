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

Order: security/publishing safety and actual contracts → task UX → owner reference images → approved `docs/design/UX_SPEC.md` and `docs/design/README.md`.

### Reference fidelity (owner decision 09.10.2026)
An owner image (found or generated) is reproduced **visually exactly, built from our system**:
- **Copy from the image:** composition and grid, column proportions, the set and order of elements, element shapes (pill vs square, radius, borders, dividers, cards vs plain rows), sizes of blocks, controls, media and icons, spacing and density, alignment, visible states.
- **Always ours:** colours (each mapped to the nearest semantic token, both themes), fonts (nearest step of our type scale and weight), components (`shared/ui` primitives and existing feature components).
- **Our system cannot express a shape or size:** never style it locally; send `UI_PRIMITIVE_REQUEST` (new primitive variant or token) to design-system through the orchestrator and record it as a token delta until it lands.
- Generated images are often inconsistent (uneven spacing, garbled text, impossible sizes): normalize to one value per repeated element and list each deviation. An image usually shows one width; other widths follow `UX_SPEC.md` rules.
- **The image is the target screen, not inspiration.** This rule overrides every handoff, story, packet and role default. Nobody may weaken it with wording such as "structure only", "composition only", "copy the convention, not the look", "not a source for components" or "keep the current layout". The current screen is not the target when a reference exists. A handoff or prototype that contradicts the image is a `FAIL`, routed back to its author.
- **Every element in the image is built, in its place.** A control the product cannot honour yet (no API, contract or security limit) stays in the prototype as a mock and is listed under `API needs` with the reason; the implementation leaves it out only through that list. Image copy that would make a false claim (for example a file-size limit the server does not enforce) uses the true value.
- **Images that disagree:** each screen follows the image dedicated to it (for example the editor board for the editor, the modal image for the modal); a background screen inside another image is not a source.
- **Dark theme** reproduces the image's dark look with our dark tokens; **light theme** is the same layout with light tokens.
- **Realistic fixtures:** real photos at least 1000 px wide, video posters with durations, as many media items as the image shows, long Russian titles and file names. A 1×1 placeholder or empty media never counts as visual evidence.

### Reference intake
- The owner drops image files into the chat (file path visible) or into `design-refs/<task>/` (committed, so every tool and agent sees the same images). A clipboard-only image is visible to the main session but not to subagents: the orchestrator asks for the file instead of describing it.
- The task packet records `reference ID → path → screen/state → width the image represents → required elements`. A missing image means its visual claims cannot pass: request it or mark NOT_RUN; never invent similarity. No reference: use the current app design and its approved prototype.
- Before building, ui-prototyper writes a **reference measurement** in the handoff: grid and columns, spacing, element sizes, radii, type size/weight per text role, icon sizes, and the token or primitive chosen for each.

Save accepted prototype **commit SHA + route + fixture IDs + screenshot paths + allowable deviations** in the handoff. Changed design requires a new revision and repeated prototype check. User-facing demo route exists only when the code is actually running; do not invent a live URL.

## Token budget

Follow `docs/TOKEN_BUDGET.md` (images: view downscaled copies, open only the ones compared; slice screen sets; fresh agent per repair round).

## UI QA evidence, not opinions

Run a browser with deterministic data. Cover the full viewport matrix in `docs/design/UX_SPEC.md` Conventions (focus state permutations at representative widths); light/dark themes; navigation, errors, offline/loading/empty, media, confirm/cancel, keyboard, scroll, touch/safe areas and screen-reader semantics. Verify accessibility/axe and capture real screenshots. Browser console and network must reveal no unintended requests.

At prototype gate, first read the UX handoff against the image: any wording that weakens § Reference fidelity is a defect for ux-designer. Then screenshot the prototype at the width each image represents and compare side by side and as an overlay: element set, order and shapes must match; positions and sizes within ±4 px of the measurement (after the documented normalizations); colours, fonts and components are checked against tokens and `shared/ui`, not against the image. At implementation gate, compare the rendered page to accepted prototype screenshots/revision and check real outcomes. Pixel-diff is supportive, not the only test. UI QA must be independent and read-only. Missing browser/reference/testing evidence yields NOT_VERIFIED, never PASS.

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
