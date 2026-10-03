# Parallel roles with git worktrees

Work normally happens directly on `develop`. Only when two roles must write in parallel, give each its own worktree on a temporary branch from `develop`. The built-in Claude `isolation: worktree` starts from `main`, and Codex subagents share the checkout, so create them yourself:

```bash
git worktree add -b tmp/<slug>-api ../cb-<slug>-api develop
git worktree add -b tmp/<slug>-ui  ../cb-<slug>-ui  develop
# give each agent its directory in the task packet; each runs `npm ci` there once
# agents commit inside their temporary branch only
```

When both pass their checks, bring the work back as uncommitted changes on `develop` for the owner to commit:

```bash
git switch develop
git merge --squash tmp/<slug>-api
git merge --squash tmp/<slug>-ui     # paths are disjoint, so no conflicts
git worktree remove ../cb-<slug>-api && git worktree remove ../cb-<slug>-ui
git branch -D tmp/<slug>-api tmp/<slug>-ui
npm run verify
```

A merge conflict means the packets' `owned_paths` overlapped. That is a planning error: fix the plan instead of hand-merging logic.
