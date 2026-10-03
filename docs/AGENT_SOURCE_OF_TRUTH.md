# Agent source of truth and migration map

There is **one authoritative agent system**, not parallel prompts maintained in different folders.

| Purpose | Authoritative location | Generated or legacy |
|---|---|---|
| Always-loaded global rules | `AGENTS.md` | Do not add a root CLAUDE.md |
| Product area rules | `apps/backend/AGENTS.md`, `apps/frontend/AGENTS.md`, `apps/contracts/AGENTS.md` | — |
| Roles | `.agents/roles/{product-analyst,design-system,frontend,backend,researcher,qa-security}.md` | `.claude/agents/*.md`, `.codex/agents/*.toml` are generated |
| Main-session coordinator | `.agents/skills/orchestrate/SKILL.md` | `agents/orchestrator.md` is legacy; no separate orchestrator model/service |
| Procedures and long references | `.agents/skills/*/SKILL.md` and their references | Never paste every skill into every role |
| Guards/metrics/sync/verification | `.agents/hooks/*`, `.agents/scripts/*` | Tool-specific hook adapters live in `.claude/` and `.codex/` |
| Owner decisions | `docs/DECISIONS.md` | Old architecture snapshots are not authoritative |

## Migration rule
The top-level `agents/*.md` files from the earlier prototype are **redirects only**. Edit their authoritative counterparts under `.agents/` instead. After changing a role or skill, run `npm run agents:sync`, then `npm run agents:check`, `npm run check:docs` and the relevant full checks. Do not make duplicate edits to generated copies.

## Context efficiency
Each task packet supplies goal, owned paths, short acceptance criteria and only relevant document sections. Role front matter governs model/effort/tools where supported. Read-only research has no write access. Deterministic validation should run before expensive review; QA is mandatory for auth, publishing, migrations and shared contract changes. Never claim hook enforcement unless loaded by the actual tool.

## Current limits
The runner is Claude Code/Codex built-in main session and subagents, not a separate service. There is no operational full publishing flow yet. Real token/cost savings need same-task comparative measurements, not anecdotes.
