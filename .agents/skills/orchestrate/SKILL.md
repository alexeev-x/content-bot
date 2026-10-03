---
name: orchestrate
description: "Orchestrator playbook for the main session: classify a request, plan the smallest task graph, write task packets, dispatch role agents, run gates, route defects, open the PR. Use for any task spanning several areas, roles or steps."
---
# Orchestrate a task

You are the only coordinator. Spawning an agent costs a fresh context, so delegate only when isolation or parallelism pays for it.

## When not to delegate
Do it yourself when:
- the change is under about 50 lines in one area;
- it is docs only;
- it is a single obvious fix.

Never spawn every role "just in case". Never spawn qa-security for a docs-only change.

## Owner interaction
Turn a request into a plan without a question round when defaults exist. Before starting work that touches an open item in `docs/DECISIONS.md`, ask once, batched: each question with options and your recommended default. Report to the owner in short Russian: what changed, what was verified, what is `not_run`, and what is needed from them.

## Token hygiene
- One task per session; start a fresh session for an unrelated task. Before a long continuation, compact with a focus line ("keep: task packet, failing check, decisions").
- Never edit AGENTS.md, skills, settings, hooks or MCP config in the middle of a working session: they sit in the cached prefix, and changing them re-bills the whole context.
- Push noisy exploration (wide searches, long logs) into a subagent so only its summary returns.
- Compare configurations with `npm run metrics` (fed by the usage hook), not with impressions.

## 1. Classify
| Change | Route |
|---|---|
| docs only | yourself → `npm run check:docs` |
| one area, clear spec | one role (or yourself) → checks |
| UI with new visuals | design-system (only for missing tokens/primitives) → frontend |
| API or data change | contract step → backend ∥ frontend |
| publishing / auth / migration / security | as above, plus qa-security (mandatory) |
| unclear requirements | product-analyst first |

## 2. Plan
- Branch from develop: `git switch develop && git pull --ff-only && git switch -c feat/<english-slug>`.
- Cut the smallest vertical slices. Each task has one owner role and a set of `owned_paths` that no other task shares.
- Order: contract → (backend ∥ frontend) → review. Run tasks in parallel only when their paths don't overlap and the contract is fixed. Serialize these files: `apps/contracts/**`, migrations, `container.ts`, the router, the token file.

## 3. Task packet: the only context you send
```yaml
task_id: BE-2
role: backend
goal: Cron reconcile moves expired claimed jobs to retry_wait or unknown
owned_paths: [apps/backend/src/modules/publishing/**, apps/backend/migrations/**]
read_first: [apps/contracts/src/index.ts, docs/BACKEND_ARCHITECTURE.md#5]
acceptance:
  - Given a claimed job with expired lease and no send_started_at, when Cron runs, then status=retry_wait
  - Given a claimed job with expired lease and send_started_at set, when Cron runs, then status=unknown and no send happens
constraints: [no new dependencies, Free-plan limits]
```
Send paths and sections, never pasted documents, the transcript, or other roles' code.

## 4. Parallel work
See `references/parallel-worktrees.md`. Claude's built-in `isolation: worktree` branches from `main`, so don't use it for feature work.

## 5. Gates
1. Scope: `git diff --name-only develop...HEAD` must stay within the packets' `owned_paths`. Any file outside them goes back to its role.
2. Run `npm run verify` plus the area tests, and read the failures yourself.
3. Send qa-security only the acceptance criteria, the diff range and the check output.

## 6. Repair loop (bounded)
- A defect goes back to its single owning role with the defect line, only the relevant lines of the failing output, and the file. The other roles are not re-run.
- Fingerprint = check name + first error line. If the same fingerprint survives 2 repair rounds, or a round makes no progress, stop and give the owner options plus your recommended default.
- Re-review covers only the listed defect ids.

## 7. Deliver
- Commit with conventional messages.
- Push `feat/<slug>` and open a PR into `develop` with `gh pr create --base develop`, or give the compare URL.
- The PR body contains the goal, each acceptance criterion with pass/fail, the commands run with their results, risks, and the `not_run` items.
- Never merge, never touch `main`.
- Log metrics as described in `references/metrics.md`.
