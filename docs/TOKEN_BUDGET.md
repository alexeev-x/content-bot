# Token budget

**Owner priority, 09.10.2026:** token economy is the most important cost rule for agent work. Sources: Claude Code docs on [subagents](https://code.claude.com/docs/en/sub-agents.md), [prompt caching](https://code.claude.com/docs/en/prompt-caching.md), [costs](https://code.claude.com/docs/en/costs.md), [vision](https://platform.claude.com/docs/en/build-with-claude/vision.md). External token tools stay rejected (`docs/DECISIONS.md`, 03.10.2026).

## Orchestrator (main session)
- **Never resume** a finished or `partial` (turn-limit) agent: a resumed agent re-reads its whole transcript every turn, and the subagent cache lives only 5 minutes (one resumed prototyper cost 377k tokens). Start a fresh agent with the packet plus the handoff file below.
- **Packet ≤ 40 lines:** goal, owned paths, acceptance criteria, pointers (`path:lines`, doc §), constraints, report cap. Never paste documents, code, transcripts or other agents' reports; give the path.
- **Slice** big jobs so each agent finishes inside its `max_turns` (for example desktop / phone / modals).
- One task per session: `/clear` between tasks; `/compact keep: packet, failing check, decisions` at natural breaks, not after a long idle.
- After each orchestrated task, check `/usage` (per-subagent share, cache misses) before further tuning.

## Every agent
- **Report ≤ 30 lines** (root `AGENTS.md`); long tables go to `.logs/<task_id>/report.md`, cited by path.
- **Handoff file:** if work remains when stopping, write `.logs/handoff/<task_id>.md` (done, remaining, failing check, next command) so a fresh agent continues without the transcript.
- Read only needed line ranges; search with `rg`; pipe noisy commands through `tail`/`grep` (failures only).
- **Images:** an image costs about `⌈w/28⌉ × ⌈h/28⌉` tokens (1920×1080 ≈ 2.7k). Save full screenshots to disk; view only a copy with the long edge ≤ 1100 px (`sips -Z 1100 in.png --out view.png`) or a crop when small text matters. Open only the images you compare; prefer measured numbers (bounding boxes, axe JSON, `scrollWidth`).

## Role defaults
Effort per role lives in `.agents/roles/*.md` frontmatter: `medium` by default; `high` only where judgement on risk is the job (`qa-security`). Raise effort per task only when the owner or a recorded rule asks.
