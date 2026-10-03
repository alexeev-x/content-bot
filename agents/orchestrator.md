# Legacy instruction redirect — orchestrator

This top-level file is **not an agent prompt**. It is retained only as a migration pointer from the first prototype and must never be loaded as a role definition.

The orchestrator is the main session. Authoritative procedure: `.agents/skills/orchestrate/SKILL.md`. Common instructions: root `AGENTS.md`; process: `docs/AGENT_ORCHESTRATION.md`. Edit only the authoritative `.agents/` source, then run `npm run agents:sync` and `npm run agents:check`.
