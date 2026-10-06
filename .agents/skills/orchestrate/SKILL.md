---
name: orchestrate
description: "Orchestrator playbook for the main session: classify a request, plan the smallest task graph, write task packets, dispatch role agents, run gates, route defects, open the PR. Use for any task spanning several areas, roles or steps."
---
# Orchestrate a task

You are the only coordinator. Spawning an agent costs a fresh context, so delegate only when isolation or parallelism pays for it.

## When not to delegate
Handle docs-only, obvious fixes and clear single-area changes in the main session.

Never spawn every role. Do not launch qa-security for R0/R1 by default.

## Risk-based QA
Classify by behavior and consequences, not line count. Follow `references/risk-qa.md`; do not launch QA for R0/R1 by default.

## Owner interaction
Follow the root owner-interaction and recorded-decision rules.

## Token hygiene
- One task per session; start a fresh session for an unrelated task. Before a long continuation, compact with a focus line ("keep: task packet, failing check, decisions").
- Never edit AGENTS.md, skills, settings, hooks or MCP config in the middle of a working session: they sit in the cached prefix, and changing them re-bills the whole context.
- Push noisy work (wide searches, long logs) into the owning role agent or `researcher` so only its summary returns.
- For Plus comparisons, record allowance as in `references/metrics.md`; do not infer it from `npm run metrics`.

## 1. Classify
| Change | Route |
|---|---|
| docs only | yourself → `npm run check:docs` |
| one area, clear spec | one role (or yourself) → checks |
| new screen, flow or navigation; "awkward to use" | ux-designer (flow spec) → frontend |
| UI with new visuals | design-system (only for missing tokens/primitives) → frontend |
| API or data change | contract step → backend ∥ frontend |
| contract, integration, verification infrastructure (R2) | one owner per path; qa-security reviews the integrated diff |
| publishing / auth / migration / security / secrets (R3) | as above, plus mandatory qa-security before acceptance |
| unclear requirements | product-analyst first |
| research, comparison, "is this true" | researcher (read-only; give the question, constraints, word limit) |

Code, docs and reviews go only through the project roles above. Built-in helpers (`Explore`, `Plan`) are fine for read-only support; global agents are denied. Do mechanical edits yourself.

## 2. Plan
- Work on develop and check `git status`. Preserve pre-existing changes; never stash, reset or overwrite another task's work.
- Cut the smallest vertical slices. Each task has one owner role and a set of `owned_paths` that no other task shares.
- Order: contract → (backend ∥ frontend) → review. Run tasks in parallel only when their paths don't overlap and the contract is fixed. Serialize these files: `apps/contracts/**`, migrations, `container.ts`, the router, the token file.

## 3. Task packet
Send only the goal, owned paths, needed context links, acceptance criteria and constraints. Do not paste documents, the transcript or other roles' code.

## 4. Parallel work
See `references/parallel-worktrees.md`. Parallelize only independent paths, using worktrees based on `develop`.

## 5. Gates
1. Scope: `git status --porcelain` must show only files within the packets' `owned_paths`. Any file outside them goes back to its role.
2. Follow `references/risk-qa.md`. The assigned verification owner runs one final gate and reads failures; other agents run focused tests while developing, not another full suite.
3. For R2/R3, send qa-security the acceptance criteria, risk category, diff range, changed paths and actual check output. QA independently reviews the changes and owns the one full local suite.

## 6. Repair loop (bounded)
- A defect goes back to its single owning role with the defect line, only the relevant lines of the failing output, and the file. The other roles are not re-run.
- Fingerprint = check name + first error line. If the same fingerprint survives 2 repair rounds, or a round makes no progress, stop and give the owner options plus your recommended default.
- Re-review covers only the listed defect ids.

## 7. Deliver
- Don't commit or push: the owner does. Hand over a conventional commit message and a short Russian summary: the goal, each acceptance criterion with pass/fail, the commands run with results, risks, and `not_run` items.
- A release is a PR `develop → main` opened by the owner (body per `.github/pull_request_template.md`). Never touch `main`.
- Log task outcome and available Plus allowance observations as described in `references/metrics.md`; never convert token counts or API prices into Plus usage.
