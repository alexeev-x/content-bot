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
| Role | When | Model (Claude) |
|---|---|---|
| Orchestrator — main session + skill `orchestrate` | any task with several steps/roles | chosen by the session owner |
| product-analyst | only when requirements are unclear | sonnet |
| ux-designer | navigation, flows, exit/cancel/recovery spec before complex UI | sonnet |
| ui-prototyper | mock-only clickable `/__proto` prototype from accepted UX and owner reference images | sonnet |
| ui-qa | independent prototype + production visual/interaction QA; routine autonomous acceptance | sonnet |
| design-system | a new token/primitive is needed or a visual audit | sonnet |
| frontend | UI features | sonnet |
| backend | API, D1, Cron, bot and Telegram | sonnet, effort high |
| researcher | research and comparisons by primary sources; read-only | sonnet |
| qa-security | independent review: one integrated R2 review; mandatory for R3 security, permissions, migrations and publishing | opus |

There is no separate architect: architectural decisions are made by the orchestrator, changes to approved decisions by the owner, and boundary violations are caught by deterministic checks. Codex adapters do not pin a model (they inherit from the session), they set only reasoning effort and sandbox.

Risk classes (R0–R3) and who runs which final check: `.agents/skills/orchestrate/references/risk-qa.md`.

## Automatic guards (hooks, shared by Claude and Codex)
Scripts in `.agents/hooks/`, wired into `.claude/settings.json` and `.codex/hooks.json`. Hooks are best-effort guardrails: they must be enabled/trusted, inspect submitted command text only, and do not replace OS permissions or an isolated environment without production credentials. Claude project hooks are applied when project settings are accepted; Codex project hooks require trusting the project hook definitions. Command wrappers, aliases or hidden script behavior may evade lexical checks.
| Hook | What it does | Token cost |
|---|---|---|
| `guard-command` (PreToolUse) | rejects known deploy/remote/secrets/force-push/main-push commands and common secret-file reads; best-effort only, not a security boundary | 0 |
| `verify-on-stop` (Stop/SubagentStop) | runs `npm run verify:changed` through the Windows-safe runner; reuses only an unchanged snapshot and does not cache if files change or another builder remains active | no model usage |
| `track-builders` (SubagentStart/SubagentStop) | records running builder agents so `verify-on-stop` waits for parallel work | 0 |

Codex loads project hooks only after the owner trusts the project hook definitions. Claude and Codex hook payloads differ; shared scripts accept known agent-type field variants. Disable verify-on-stop with `AGENT_VERIFY_ON_STOP=0`. Neither hooks nor prompt rules restrict production access by themselves; owner-controlled sandbox and credential isolation are required.

## Process
How a task flows (classification, contract step, backend and frontend lines, gates, repair loop, delivery) is defined only in skill `orchestrate` (`.agents/skills/orchestrate/SKILL.md`); substantive UI gates in `docs/AGENT_UI_WORKFLOW.md`; risk classes in `.agents/skills/orchestrate/references/risk-qa.md`.
