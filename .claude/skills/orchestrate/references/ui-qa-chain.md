# UI flow handoff

For substantive UI work follow `docs/AGENT_UI_WORKFLOW.md`. The orchestrator starts this chain without waiting for owner prompting:

1. If requirements are unclear, `product-analyst` defines scope and acceptance criteria.
2. `ux-designer` specifies the flow, states and recovery before implementation.
3. `ui-prototyper` builds a mock-only clickable scenario in `/__proto`; `design-system` joins only for missing tokens or shared primitives.
4. Independent `ui-qa` checks prototype UX, references, design-system, responsiveness and accessibility. A PASS automatically authorizes the frontend step unless owner review is required.
5. Frontend implements the frozen accepted prototype; backend implements agreed API needs.
6. Independent `ui-qa` checks the implemented feature against the prototype. `qa-security` separately owns R2/R3 checks.

Owner approval is optional by default. Missing browser evidence means NOT_VERIFIED, not PASS. Return each finding to its owning role with evidence. Re-review the fix and repeat until QA accepts. After two rounds on the same defect, or a round with no progress, stop and report options. Copy-only and mechanical changes are exempt. Risk-based security and full-suite gates still apply.
