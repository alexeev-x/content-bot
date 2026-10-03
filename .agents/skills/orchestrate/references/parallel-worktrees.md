# Parallel roles with git worktrees

The built-in Claude `isolation: worktree` creates the worktree from the default branch (`main`), not from your feature branch. Codex subagents share the checkout unless you give them a directory. So create the worktrees yourself:

```bash
git branch feat/<slug>--api feat/<slug>
git worktree add ../cb-<slug>-api feat/<slug>--api
git branch feat/<slug>--ui feat/<slug>
git worktree add ../cb-<slug>-ui feat/<slug>--ui
# give each agent its directory in the task packet; each runs `npm ci` there once
```

When both pass their checks:

```bash
git switch feat/<slug>
git merge --no-ff feat/<slug>--api
git merge --no-ff feat/<slug>--ui   # paths are disjoint, so no conflicts
git worktree remove ../cb-<slug>-api
git worktree remove ../cb-<slug>-ui
git branch -d feat/<slug>--api feat/<slug>--ui
npm run verify
```

A merge conflict means the packets' `owned_paths` overlapped. That is a planning error: fix the plan instead of hand-merging logic.
