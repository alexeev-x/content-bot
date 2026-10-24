# Multi-agent development — how it works

Works in Claude Code and Codex from a single source. We do not write our own runner/task store: we use built-in subagents, skills, git worktree and CI.

## Where things live
| What | Source (edit here) | What is generated |
|---|---|---|
| Common rules | `AGENTS.md` (root) | — (both tools read it natively) |
| Accepted and open decisions | `docs/DECISIONS.md` | — |
| Area rules and code style | `apps/backend/AGENTS.md`, `apps/frontend/AGENTS.md`, `apps/contracts/AGENTS.md` | — |
| Roles | `.agents/roles/<role>.md` | `.claude/agents/<role>.md`, `.codex/agents/<role>.toml` |
| Procedures (skills) | `.agents/skills/<name>/**` | generated, content-checked copies in `.claude/skills/<name>/**` |

After editing roles or skills: `npm run agents:sync`. CI (`npm run agents:check`) fails if the adapters diverge from the source. `npm run check:docs` watches instruction size budgets, broken links and stale paths.

**Important for Claude Code:** do not create `CLAUDE.md` in the root. When it exists, Claude stops reading `AGENTS.md` (and nested `apps/backend/AGENTS.md`, etc.). A Claude Code version with AGENTS.md support is required (v2.1.277+). A personal `CLAUDE.local.md` also disables reading `AGENTS.md`.

## Roles
The main session does most work itself (skill `orchestrate`); a subagent costs a full context load, so roles exist only where isolation pays.

| Role | When | Model (Claude) |
|---|---|---|
| Main session + skill `orchestrate` | every task by default | chosen by the session owner |
| backend / frontend | large independent halves of one feature, in parallel | sonnet |
| design-system | broad token/primitive restyle | sonnet |
| researcher | research and comparisons by primary sources; read-only | sonnet |
| qa-security | review of R3 changes (auth, migrations, publishing, secrets) before commit | opus |

Risk classes (R0–R3) and checks: skill `orchestrate` § Risk gate.

## Automatic guards (hooks, shared by Claude and Codex)
Scripts in `.agents/hooks/`, wired into `.claude/settings.json` and `.codex/hooks.json`. Hooks are best-effort guardrails: they must be enabled/trusted, inspect submitted command text only, and do not replace OS permissions or an isolated environment without production credentials. Claude project hooks are applied when project settings are accepted; Codex project hooks require trusting the project hook definitions. Command wrappers, aliases or hidden script behavior may evade lexical checks.
| Hook | What it does | Token cost |
|---|---|---|
| `guard-command` (PreToolUse) | rejects known deploy/remote/secrets/force-push/main-push/PR-merge commands and common secret-file reads; best-effort only, not a security boundary | 0 |
| `verify-on-stop` (Stop/SubagentStop) | runs `npm run verify:changed` through the Windows-safe runner; reuses only an unchanged snapshot and does not cache if files change or another builder remains active | no model usage |
| `track-builders` (SubagentStart/SubagentStop) | records running builder agents so `verify-on-stop` waits for parallel work | 0 |

Codex loads project hooks only after the owner trusts the project hook definitions. Claude and Codex hook payloads differ; shared scripts accept known agent-type field variants. Disable verify-on-stop with `AGENT_VERIFY_ON_STOP=0`. Neither hooks nor prompt rules restrict production access by themselves; owner-controlled sandbox and credential isolation are required.

## Process
Defined only in skill `orchestrate` (`.agents/skills/orchestrate/SKILL.md`).
