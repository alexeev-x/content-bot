# UI flow handoff

For every substantive user-facing screen or interaction flow, the main-session orchestrator starts the role chain without waiting for an owner reminder:

1. If requirements are unclear, `product-analyst` defines scope and acceptance criteria.
2. `ux-designer` specifies the flow, states and recovery before implementation.
3. `design-system` joins only when tokens or shared primitives are missing.
4. The owning builder implements the accepted UX and reports focused checks.
5. An independent `qa-security` reviewer checks behavior and accessibility against the criteria before acceptance, including R1 UI flows.

Return each finding to its owning role with evidence. Re-review the fix and repeat until QA accepts. After two rounds on the same defect, or a round with no progress, stop and report options. Copy-only and mechanical changes are exempt. Risk-based security and full-suite gates still apply.
