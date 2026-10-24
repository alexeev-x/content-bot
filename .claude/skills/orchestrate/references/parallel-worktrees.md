# Parallel roles with git worktrees

Work normally happens directly on `develop`. Only when two builders must write in parallel, give each its own worktree on a branch from `develop`. The built-in Claude `isolation: worktree` starts from `main`, and Codex subagents share the checkout, so create them yourself:

```bash
git worktree add -b feat/<slug>-api ../cb-<slug>-api develop
git worktree add -b feat/<slug>-ui  ../cb-<slug>-ui  develop
# give each agent its directory in the task packet; each runs `npm ci` there once
# agents commit inside their branch only
```

When both pass their checks, merge them into `develop`:

```bash
git switch develop
git merge --squash feat/<slug>-api && git merge --squash feat/<slug>-ui   # paths are disjoint
git worktree remove ../cb-<slug>-api && git worktree remove ../cb-<slug>-ui
git branch -D feat/<slug>-api feat/<slug>-ui
npm run verify
git commit -m "feat: <slug>" && git push origin develop
```

A merge conflict means the packets' `owned_paths` overlapped. That is a planning error: fix the plan instead of hand-merging logic.
