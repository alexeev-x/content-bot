# Multi-agent development — how it works

**Updated:** 03.10.2026. Works in Claude Code and Codex from a single source. We do not write our own runner/task store: we use built-in subagents, skills, git worktree and CI.

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
| ux-designer | navigation, user flows and interaction of a screen before it is built or when it is awkward to use | sonnet |
| design-system | a new token/primitive is needed or a visual audit | sonnet |
| frontend | UI features | sonnet |
| backend | API, D1, Cron, bot and Telegram | sonnet, effort high |
| researcher | research and comparisons by primary sources; read-only | sonnet |
| qa-security | independent review: one integrated R2 review; mandatory for R3 security, permissions, migrations and publishing | opus |

There is no separate architect: architectural decisions are made by the orchestrator, changes to approved decisions by the owner, and boundary violations are caught by deterministic checks. Codex adapters do not pin a model (they inherit from the session), they set only reasoning effort and sandbox.

### Risk-based QA and verification
Classify the final changed behavior, not the number of lines. R0 (non-behavioral docs/formatting) and R1 (clear, reversible, single-area changes) do not launch independent QA by default. R2 (contracts, multi-area integration, shared primitives or verification infrastructure) gets one independent review of the integrated diff. R3 (auth, permissions, sessions, migrations/data integrity, publishing side effects, secrets or production-related configuration) requires independent QA before acceptance. Raise risk when the scope grows or impact is uncertain. Related low-risk work can share one final check; related R2 work can share one integrated review.

The implementer runs focused tests while working. The main session owns the R0/R1 final gate; a successful stop-hook `verify:changed` can satisfy only that scoped gate when its result covers the final unchanged worktree. For R2/R3, QA owns one full local `npm run verify` and the relevant integration or failure tests; a scoped hook result never substitutes for the full suite. Reuse a prior full-suite result only when that exact command passed for the exact unchanged worktree and its output is available. Changed code, failed checks, timeouts or incomplete coverage require rerunning only the affected required check. CI remains an independent full check. Deterministic format, type, architecture and regression commands do not require an AI reviewer.

## Token savings without loss of quality
1. **Context layers.** Always: root `AGENTS.md` (~5 KB). Per area: `<area>/AGENTS.md` (~1–3.5 KB). Role: ~2 KB. Procedures are skills, their body is loaded only when invoked. Large architecture documents — only the needed section by link. Previously every agent was required to read ~69 KB of documents.
2. **The agent receives a task packet** (goal, paths, criteria, links), not the conversation and not copies of documents.
3. **The agent's report** is a short JSON from `AGENTS.md`; logs — only the relevant lines.
4. **Instructions in English** (fewer tokens for the same idea); all documentation is in English too; only communication with the owner and end-user UI copy are Russian.
5. **A stable prefix** for the cache: `AGENTS.md` contains no dates, task statuses or other frequently changing content.
6. **Deterministic checks instead of LLM**: Prettier, Oxlint, types, dependency-cruiser, Vitest, build, budgets, adapter sync and full-history Gitleaks. Next: Playwright.
7. **Loop limits:** maxTurns on roles; two failed fixes of the same error → escalation to the owner.
8. **Measurement:** `.agent-metrics/log.jsonl` per task (see skill `orchestrate`). We do not claim savings percentages without a comparison on the same set of tasks.

## Automatic guards (hooks, shared by Claude and Codex)
Scripts in `.agents/hooks/`, wired into `.claude/settings.json` and `.codex/hooks.json`. Hooks are best-effort guardrails: they must be enabled/trusted, inspect submitted command text only, and do not replace OS permissions or an isolated environment without production credentials. Claude project hooks are applied when project settings are accepted; Codex project hooks require trusting the project hook definitions. Command wrappers, aliases or hidden script behavior may evade lexical checks.
| Hook | What it does | Token cost |
|---|---|---|
| `guard-command` (PreToolUse) | rejects known deploy/remote/secrets/force-push/main-push commands and common secret-file reads; best-effort only, not a security boundary | 0 |
| `verify-on-stop` (Stop/SubagentStop) | runs `npm run verify:changed` through the Windows-safe runner; reuses only an unchanged snapshot and does not cache if files change or another builder remains active | no model usage |
| `log-usage` (Stop/SubagentStop, Claude) | writes session and subagent tokens to `.agent-metrics/sessions/` | 0 |

Codex loads project hooks only after the owner trusts the project hook definitions. Claude and Codex hook payloads differ; shared scripts accept known agent-type field variants. Disable verify-on-stop with `AGENT_VERIFY_ON_STOP=0`. Neither hooks nor prompt rules restrict production access by themselves; owner-controlled sandbox and credential isolation are required.

## Measurement
`npm run metrics` summarizes Claude Code token counts with relative token-price weights; it does not measure Codex Plus allowance. For Plus, record the displayed five-hour and weekly remaining percentages and reset times before and after comparable real tasks, along with models/reasoning/speed, retries, agent launches, acceptance and first-pass CI in `.agent-metrics/log.jsonl` (see `.agents/skills/orchestrate/references/metrics.md`). Keep unavailable values null; do not convert API/token prices or sum parent and subagent percentages. Do not repeat tasks solely to benchmark quota.

## What we checked and do not adopt (03.10.2026)
- RTK (command output compression, "up to 90%"): independent Quesma test — task cost +1…+17%, quality −1–2%, one version had infinite loops. Instead — our `verify`, which shortens output but writes the full log to `.logs/verify.log`.
- Caveman (ultra-short answers, "−65%"): JetBrains on 82 tasks — −8.5% output with no change in quality. We adopted lightweight brevity rules in `AGENTS.md`, without a skill and proxy (the proxy has telemetry by default).
- claude-context (vector search): needs a paid external API, code leaves the machine — against project rules.
- context-mode: ELv2 license, a separate state store, 98% is a best-case example.
- Serena (LSP tools): a possible experiment when there is a lot of code; the repository is small now.
- The main real saving is prompt caching (cache read ≈ 0.1 of the price) and short context: in the agent setup session cache read is 24.4 million tokens versus 228 tokens of fresh input.

## Process
Request → risk classification → (analyst when requirements are unclear) → contract → backend ∥ frontend in separate worktrees when paths do not overlap → one final gate owned by the main session for R0/R1 or QA for R2/R3 → qa-security only for R2/R3 → owner's commit and push to `develop`; GitHub CI runs full verification on pushes to `develop`/`main` and pull requests. After green checks CI deploys `develop` to Worker `dev` and `main` to Worker `app`; remote migrations stay manual owner actions. Release to `main` is a PR from `develop`.
Built-in `isolation: worktree` in Claude Code creates the worktree from the default branch (`main`), so for parallel work the orchestrator creates the worktree from `develop` manually (`references/parallel-worktrees.md` in skill `orchestrate`).
