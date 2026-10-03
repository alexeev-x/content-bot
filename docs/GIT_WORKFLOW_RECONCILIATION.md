# Git workflow — conflicting owner instructions to reconcile

The owner previously established `feat/<english-task-name> → develop → main` and PR review for every task. The current `docs/DECISIONS.md`, root `AGENTS.md` and the Claude orchestrate skill instead say direct owner-managed commits on `develop` and owner-created release PR to `main`.

These cannot both be canonical. This documentation-sync change uses the earlier explicit feature-PR workflow to avoid direct modification of develop. **No owner decision is silently overwritten**: after reviewing this discrepancy, update `docs/DECISIONS.md`, root `AGENTS.md`, `.agents/skills/orchestrate/SKILL.md`, README and any hooks together in one change, then verify adapters and CI.

Until resolved: never commit or push directly to main; no force-push; no automatic deploy or remote migration; production release only by owner. Do not assume a feature-branch rule can be enforced by the existing hooks when they currently guard primarily main.
