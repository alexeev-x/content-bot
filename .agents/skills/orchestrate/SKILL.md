---
name: orchestrate
description: "Orchestrator playbook for the main session: classify a request, plan the smallest task graph, write task packets, dispatch role agents, run gates, route defects, open the PR. Use for any task spanning several areas, roles or steps."
---
# Orchestrate a task

You coordinate. Delegate only when isolation or parallelism justifies a fresh agent context.

## When not to delegate
Handle docs-only, obvious fixes and clear single-area changes in the main session.

Launch only needed roles; qa-security is not default for R0/R1.

Substantive UI: `docs/AGENT_UI_WORKFLOW.md`.

## Token hygiene
- One task per session; new task, new session. For long tasks, compact with a focus line ("keep: task packet, failing check, decisions").
- Do not edit cached instructions, skills, hooks or settings mid-session; it invalidates prompt cache.
- Delegate noisy searches and logs; return only the role's summary.

## 1. Classify
| Change | Route |
|---|---|
| docs only | yourself → `npm run check:docs` |
| one area, clear spec | one role (or yourself) → checks |
| substantial screen, flow, or UI references | ux-designer → ui-prototyper → ui-qa → frontend → ui-qa |
| missing visual primitive/token | design-system (scoped request) → owning builder |
| API or data change | contract step (you) → backend ∥ frontend |
| contract, integration, verification infrastructure (R2) | one owner per path; qa-security reviews the integrated diff |
| publishing / auth / migration / security / secrets (R3) | as above, plus mandatory qa-security before acceptance |
| unclear requirements | product-analyst first |
| research, comparison, "is this true" | researcher (read-only; give the question, constraints, word limit) |

Code, docs and reviews go only through the project roles above. Built-in helpers (`Explore`, `Plan`) are fine for read-only support; global agents are denied. Do mechanical edits yourself.

## 2. Plan
- Work on develop and check `git status`. Preserve pre-existing changes; never stash, reset or overwrite another task's work.
- Cut the smallest vertical slices. Each task has one owner role and a set of `owned_paths` that no other task shares.
- **Contract step:** you (the main session) write the `apps/contracts` change with skill `contract-change` before any builder starts. Builders never edit contracts: backend answers `BLOCKED: contract`, frontend sends `CONTRACT_REQUEST`, and you update the contract.
- **Two lines after the contract:**
  - Backend line: backend (tests first) → its focused checks.
  - Frontend line: plain UI → frontend; substantive UI → ux-designer → ui-prototyper → ui-qa `PROTOTYPE_PASS` → frontend → ui-qa `IMPLEMENTATION_PASS` (`docs/AGENT_UI_WORKFLOW.md`). Backend may run while UX and the prototype are in progress; frontend implementation waits for `PROTOTYPE_PASS`.
  - Both lines join at the final gate (§5).
- Serialize these files (one task at a time): `apps/contracts/**`, migrations, `container.ts`, the router, the token file.

## 3. Task packet
Send only the goal, owned paths, needed context links, acceptance criteria and constraints. Do not paste documents, the transcript or other roles' code.

## 4. Parallel work
See `references/parallel-worktrees.md`. Parallelize only independent paths, using worktrees based on `develop`. At most two builders at once, and never two heavy suites (`npm run verify`, vitest, Playwright, `vite build`) at the same time: the owner's 16 GB laptop runs out of memory. Parallel builders run focused tests only; the full verify runs once, after they finish.

## 5. Gates
1. Scope: `git status --porcelain` must show only files within the packets' `owned_paths`. Any file outside them goes back to its role.
2. Follow `references/risk-qa.md`. The assigned verification owner runs one final gate and reads failures; other agents run focused tests while developing, not another full suite.
3. For R2/R3, send qa-security the acceptance criteria, risk category, diff range, changed paths and actual check output. QA independently reviews the changes and owns the one full local suite.

## 6. Repair loop (bounded)
- A defect goes back to its single owning role with the defect line, only the relevant lines of the failing output, and the file. The other roles are not re-run.
- Fingerprint = check name + first error line. If the same fingerprint survives 2 repair rounds, or a round makes no progress, stop and give the owner options plus your recommended default.
- Re-review covers only the listed defect ids.

## 7. Deliver
- Don't commit or push: the owner does. End with the final message from root AGENTS.md: Russian summary (goal, each acceptance criterion pass/fail, commands run, risks, `not_run`), the migration note only when a migration was added, and the conventional commit message last.
- A release is a PR `develop → main` opened by the owner (body per `.github/pull_request_template.md`). Never touch `main`.
