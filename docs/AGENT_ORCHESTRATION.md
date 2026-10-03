# Multi-agent development — how it works

**Updated:** 03.10.2026. Works in Claude Code and Codex from a single source. We do not write our own runner/task store: we use built-in subagents, skills, git worktree and CI.

## Where things live
| What | Source (edit here) | What is generated |
|---|---|---|
| Common rules | `AGENTS.md` (root) | — (both tools read it natively) |
| Accepted and open decisions | `docs/DECISIONS.md` | — |
| Area rules and code style | `apps/backend/AGENTS.md`, `apps/frontend/AGENTS.md`, `apps/contracts/AGENTS.md` | — |
| Roles | `.agents/roles/<role>.md` | `.claude/agents/<role>.md`, `.codex/agents/<role>.toml` |
| Procedures (skills) | `.agents/skills/<name>/SKILL.md` | symlinks `.claude/skills/<name>` |

After editing roles or skills: `npm run agents:sync`. CI (`npm run agents:check`) fails if the adapters diverge from the source. `npm run check:docs` watches instruction size budgets, broken links and stale paths.

**Important for Claude Code:** do not create `CLAUDE.md` in the root. When it exists, Claude stops reading `AGENTS.md` (and nested `apps/backend/AGENTS.md`, etc.). A Claude Code version with AGENTS.md support is required (v2.1.277+). A personal `CLAUDE.local.md` also disables reading `AGENTS.md`.

## Roles
| Role | When | Model (Claude) |
|---|---|---|
| Orchestrator — main session + skill `orchestrate` | any task with several steps/roles | chosen by the session owner |
| product-analyst | only when requirements are unclear | sonnet |
| design-system | a new token/primitive is needed or a visual audit | sonnet |
| frontend | UI features | sonnet |
| backend | API, D1, Cron, bot and Telegram | sonnet, effort high |
| researcher | research and comparisons by primary sources; read-only | sonnet |
| qa-security | independent acceptance; mandatory for publishing/auth/migrations/contracts | opus |

There is no separate architect: architectural decisions are made by the orchestrator, changes to approved decisions by the owner, and boundary violations are caught by deterministic checks. Codex adapters do not pin a model (they inherit from the session), they set only reasoning effort and sandbox.

## Token savings without loss of quality
1. **Context layers.** Always: root `AGENTS.md` (~5 KB). Per area: `<area>/AGENTS.md` (~1–3.5 KB). Role: ~2 KB. Procedures are skills, their body is loaded only when invoked. Large architecture documents — only the needed section by link. Previously every agent was required to read ~69 KB of documents.
2. **The agent receives a task packet** (goal, paths, criteria, links), not the conversation and not copies of documents.
3. **The agent's report** is a short JSON from `AGENTS.md`; logs — only the relevant lines.
4. **Instructions in English** (fewer tokens for the same idea); all documentation is in English too; only communication with the owner and end-user UI copy are Russian.
5. **A stable prefix** for the cache: `AGENTS.md` contains no dates, task statuses or other frequently changing content.
6. **Deterministic checks instead of LLM** (types, build, budgets, adapter sync). Next: ESLint, dependency-cruiser, Vitest, Playwright, gitleaks.
7. **Loop limits:** maxTurns on roles; two failed fixes of the same error → escalation to the owner.
8. **Measurement:** `.agent-metrics/log.jsonl` per task (see skill `orchestrate`). We do not claim savings percentages without a comparison on the same set of tasks.

## Automatic guards (hooks, shared by Claude and Codex)
Scripts in `.agents/hooks/`, wired into `.claude/settings.json` and `.codex/hooks.json`. A rule in text can be ignored by the model; a hook cannot.
| Hook | What it does | Token cost |
|---|---|---|
| `guard-command` (PreToolUse) | blocks deploy/rollback, `--remote`, changes to wrangler secrets, force-push, push/commit to `main`, reading `.env`/`.dev.vars` | 0 |
| `verify-on-stop` (Stop/SubagentStop) | at the end of a turn, only if files changed since the last green run, runs `npm run verify`; on red it does not let the building agent finish (at most 2 times per state); does not touch read-only roles | 0 on green; ≤ 25 lines on red |
| `log-usage` (Stop/SubagentStop, Claude) | writes session and subagent tokens to `.agent-metrics/sessions/` | 0 |

Codex loads project hooks only after trusting the `.codex/` layer (the `/hooks` command). Disable the check on stop: `AGENT_VERIFY_ON_STOP=0`. The hook also triggers on command text (for example, a heredoc containing a forbidden phrase) — this is a deliberate over-precaution; write such text via a file.

## Measurement
`npm run metrics` — a per-session table: output, cache read/write, fresh input and relative cost (input 1, cache write 1.25, cache read 0.1, output 5; exact prices — per the model's price list). Comparing configurations: 8–10 identical tasks × 3 runs per variant, a fresh session, the same model; savings count only if the `verify` pass rate and the number of turns did not drop. A gain < 10% is considered noise.

## What we checked and do not adopt (03.10.2026)
- RTK (command output compression, "up to 90%"): independent Quesma test — task cost +1…+17%, quality −1–2%, one version had infinite loops. Instead — our `verify`, which shortens output but writes the full log to `.logs/verify.log`.
- Caveman (ultra-short answers, "−65%"): JetBrains on 82 tasks — −8.5% output with no change in quality. We adopted lightweight brevity rules in `AGENTS.md`, without a skill and proxy (the proxy has telemetry by default).
- claude-context (vector search): needs a paid external API, code leaves the machine — against project rules.
- context-mode: ELv2 license, a separate state store, 98% is a best-case example.
- Serena (LSP tools): a possible experiment when there is a lot of code; the repository is small now.
- Prompt caching and scoped context are candidate cost levers. Report measured savings only from repeatable task comparisons, archived usage logs and actual model pricing; a single setup-session counter is not evidence of comparative savings.

## Process
Request → classification → (analyst) → contract → backend ∥ frontend in separate worktrees when paths do not overlap → `npm run verify` → qa-security → owner's commit to `develop`; release — PR `develop` → `main`. Merge and release to `main` — owner only.
Built-in `isolation: worktree` in Claude Code creates the worktree from the default branch (`main`), so for parallel work the orchestrator creates the worktree from `develop` manually (`references/parallel-worktrees.md` in skill `orchestrate`).
