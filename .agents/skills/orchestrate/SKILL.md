---
name: orchestrate
description: "Main-session playbook: when to do the work yourself vs delegate, risk gate, task packets, repair loop, commit and push to develop, batched releases and hotfixes. Use for any task spanning several areas or steps."
---
# Orchestrate a task

Default: **do it yourself in the main session.** Every subagent re-reads its rules, skills and docs from scratch, so delegation costs a full context load. Delegate only when that cost buys something.

## When to delegate
| Situation | Who |
|---|---|
| docs, single-area change, UI screen, bug fix | yourself |
| backend and frontend both large and independent (after the contract) | `backend` ∥ `frontend` (max two at once, 16 GB laptop) |
| broad shared token/primitive restyle | `design-system` |
| "which is best / is this true" research | `researcher` (question, constraints, word limit) |
| R3 change finished | `qa-security` review |
| noisy search across many files | `Explore`, take only the conclusion |

No prototype stage: build UI directly in production code from `design-refs/<task>/` images and our tokens/primitives. A throwaway prototype is only for a brand-new complex flow the owner wants to see before the API exists, and only when the owner asks.

## Flow
1. `git status`; work on `develop` (or `feat/<slug>` for multi-commit work). Preserve others' uncommitted changes.
2. Contract first (yourself, skill `contract-change`) if any shape changes.
3. Build the smallest vertical slice. Backend: tests only for critical paths (skill `testing`). Frontend: compose `shared/ui`; a missing primitive is added in `shared/ui`, never styled locally.
4. UI: check in a browser at 375 and 1280 px (skill `visual-check`), light and dark. Compare with the reference image side by side once, not per state.
5. Gate (below), then commit and push (root `AGENTS.md` § Git).

## Risk gate
| Risk | Typical change | Review | Check |
|---|---|---|---|
| R0 | docs, copy, formatting | — | `npm run check:docs` or format check |
| R1 | single-area behavior, UI, refactor with tests green | — | `npm run verify:changed` |
| R2 | contract and consumers, shared primitives, verification tooling | — | `npm run verify` |
| R3 | auth, sessions, webhook, migrations, publishing/Telegram, secrets, command safety | `qa-security` before commit | `npm run verify` + the relevant failure tests |

The stop hook runs `verify:changed` automatically; a green hook result on the unchanged tree counts for R1. The pre-push hook runs `verify:changed` with the tests named after the changed files (a contract change runs a whole suite); CI on a `develop` push checks, scans for secrets and deploys without running the tests again, and runs every test on PRs and `main`.

## Task packet (when delegating)
≤ 40 lines: goal, owned paths, acceptance criteria, pointers (`path:lines`, doc §), constraints, report cap. Never paste documents, code or transcripts. Builders never edit `apps/contracts`; they answer `BLOCKED: contract`. Serialize `apps/contracts/**`, migrations, `container.ts`, the router and the token file (one task at a time). Parallel builders use worktrees: `references/parallel-worktrees.md`.

## Repair loop
A failure goes back to its owner with only the failing lines and file. Same first error after 2 rounds, or no progress → stop and give the owner options with a recommended default. Never resume a finished agent; start fresh with the packet plus `.logs/handoff/<task>.md`.

## Deliver
Commit (conventional message), push `develop`/branch (CI applies DEV migrations before deploying), then the final message from root `AGENTS.md`. Never touch `main`.

## Releases and hotfixes (owner, 25.10.2026)
- Work piles up on `develop`; small tasks never go to production alone. After a release (the owner's `develop → main`), the first `develop` commit raises the minor version (`0.2.0 → 0.3.0`) in the root and `apps/contracts` `package.json`.
- Only a critical production bug (posts lost, duplicated or wrong in the channel, the bot or the studio down, data loss, a security hole) gets a hotfix: branch `hotfix/…` from `main`, the fix and a patch version (`0.1.0 → 0.1.1`), a PR into `main` for the owner to merge, then `main` merged back into `develop`.
