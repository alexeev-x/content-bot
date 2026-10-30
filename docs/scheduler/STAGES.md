# Scheduler stages — who reads what

The orchestrator (main session) runs one stage at a time and hands each agent a packet of ≤ 40 lines: the stage's
checklist from `MASTER-PLAN.md` §11 plus only the sections below. An agent never opens the other plan files or
sections; if it needs more, it asks the orchestrator. Reports ≤ 20 lines (AGENTS.md). Sections are cited by number
so the routing survives edits.

| Stage | Agent | Read only |
|---|---|---|
| 0 build extraction | backend | MASTER §11 «Stage 0»; core §0, §1, §3; rubrics §0, §1.1–1.3, §1.10 |
| 0 rubric keys in contracts | frontend | MASTER §11 «Stage 0» (contracts line); frontend §9 |
| 1 publishing + 0117 | backend | MASTER §11 «Stage 1»; core §4 |
| 2 audience + 0118 | backend | MASTER §11 «Stage 2»; analytics §2, §3, §4, §5.1, §5.4, §12.1, §13, §14 |
| 3 pure core + forecast | backend | MASTER §11 «Stage 3»; core §5, §13, §17 (forecast endpoint) |
| 3 F1 screens | design-system | MASTER §11 «Stage 3»; design §1–§5, §8, §10 |
| 3 F1 screens + manual tags removal | frontend | MASTER §11 «Stage 3»; frontend §2, §4–§6.1, §6.3, §7, §10, §13; design §14 |
| 4 slot machinery + go-live | backend | MASTER §11 «Stage 4»; core §6.1, §7–§12, §14, §16, §17; rubrics §1.4–§1.6 and entries 15, 16, 18, 22, 24, 25, 30 |
| 4 F2 screens | frontend | MASTER §11 «Stage 4»; frontend §6.2, §6.4, §6.5, §9, §11, §12 |
| P Browser Rendering | backend | MASTER §11 «Stage P»; core §15 |
| 5 events, anchors, bets | backend | MASTER §11 «Stage 5»; core §6.2, §11.2; rubrics §1.7, §3 (01–09), entry 31, §6 |
| 6 remaining rubrics | backend | MASTER §11 «Stage 6»; rubrics §1.8, §1.9, §4 (entries not done in stage 4), §6, §7 |
| 7 analytics | backend | MASTER §11 «Stage 7»; analytics §5.2, §6–§9, §11, §12.2–§12.4, §15 |
| 7 F5 screens | frontend | MASTER §11 «Stage 7»; frontend §6.6, §6.7, §12 |
| 8 learning | backend | MASTER §11 «Stage 8»; analytics §5.3, §10, §12.5 |
| 9 cleanup | backend | MASTER §11 «Stage 9» |

Files: MASTER = `MASTER-PLAN.md`, core = `area-backend-core.md`, analytics = `area-backend-analytics.md`, rubrics =
`area-backend-rubrics.md`, frontend = `area-frontend.md`, design = `area-design.md`. Owner rules and decisions stay in
`docs/RUBRICS_SCHEDULER.md` and `docs/DECISIONS.md`; a packet quotes the rule it needs, the agent does not read them whole.

Checks: one bounded QA pass (≤ 60 lines, only the stage's sections) before stages 1, 2 and 4 are coded, and an
independent review after them (R3, skill `orchestrate`). The orchestrator states the agent count and rough cost to the
owner before each stage.
