# Risk-based QA and verification

Classify the final diff. Use changed behavior, consumers, permissions, external side effects, retry safety, failure consequences and test coverage. A short permission check may be high risk; a large mechanical formatting change may be low risk. Raise risk when scope grows or impact is uncertain.

Common R3 paths include `apps/backend/src/modules/identity/**`, `apps/backend/src/modules/publishing/**`, `apps/backend/migrations/**`, authentication/webhook routes, permission checks, and production-related Worker configuration. Classify by actual behavior; the path list is a prompt to inspect, not a file-extension rule.

| Risk | Typical changes | Independent QA | Final local gate |
|---|---|---|---|
| R0 | Comments, typos, formatting, documentation that does not change instructions or permissions | No | Applicable docs/format check |
| R1 | Reversible, single-area behavior with clear acceptance criteria and regression coverage | No by default | Main session: `npm run verify:changed` and focused tests |
| R2 | API contract or its consumers, multi-area integration, shared primitives, agent policy or verification infrastructure | One review of the integrated change | QA owns one `npm run verify` and affected integration tests |
| R3 | Authentication, authorization, sessions, webhook trust, migrations/data integrity, publishing/scheduling/Telegram side effects, secrets, command safety or production-related configuration | Required before acceptance | QA owns one `npm run verify` and applicable security, migration or failure tests |

For related R0/R1 work, share one final check. Related R2 changes may share one review after integration; do not combine unrelated work. Never defer R3 review past acceptance.

The builder runs focused tests while developing. The main session owns the R0/R1 final gate; a passing stop-hook `verify:changed` may satisfy that scoped gate only when it covers the final unchanged worktree and its actual result is available. For R2/R3, QA owns one full local `npm run verify` and risk-specific checks; builders report focused results. A scoped `verify:changed` result never substitutes for this full suite. Reuse a prior full-suite result only when the exact command passed for the exact unchanged worktree and its output is available. If files change, a required check fails or times out, or coverage is incomplete, rerun only the affected required gate. CI independently runs the full suite.

Formatting, type, architecture and regression checks are deterministic commands, not reasons to launch an AI reviewer. A failure first goes to its code owner with the command and evidence. Raise risk and review again if the defect expands scope, reveals an untested boundary, or persists for two repair rounds/no progress.
