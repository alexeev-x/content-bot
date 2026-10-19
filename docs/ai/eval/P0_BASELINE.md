# P0 inventory and baseline — 2026-10-19

Source plan: [ALEXEEV AI development and test plan](../../ALEXEEV_AI_DEVELOPMENT_AND_TEST_PLAN.md), package P0. This records repository evidence, not a DEV acceptance result.

## Snapshot and matrix

- Branch and starting HEAD: `develop`, `b553700` (19 October 2026). The source plan was present as an untracked owner file and was not edited.
- Local verification: `npm.cmd run verify` passed: agents, docs, tooling tests, lint, architecture, format, typecheck, backend tests, frontend tests, build. Build reports large chunks as a warning, not a failure. No model request was made; incremental LLM cost is $0.
- GitHub CI status and DEV deployment status: unverified. Workflow configuration in `.github/workflows/ci.yml` runs checks and applies pending DEV D1 migrations before Worker deploy, but the `gh` CLI is unavailable here. Configuration does not prove a successful run.

| Area | Present in code or tests | Missing evidence or behavior for this plan |
| --- | --- | --- |
| Telegram editor | `app/bot/ai-writer.ts` handles `/redactor`, format selection, questions, drafts, edits, rewrites, feedback and approval. `bot-ai-feedback.test.ts` covers note/edit ownership and cancellation. | No recorded live DEV question → answer → draft → approval round trip. No integration test covers that complete bot sequence, concurrent drafts, stale buttons or Worker restart. |
| Needs facts | `writer.ts` stores `needs_facts` without `AI_DRAFT`; `ai-writer.test.ts` verifies that the question cannot be edited, approved or published. Migration 0062 adds the result and question fields. | DEV application of 0062 and response shape are unverified. The first real owner reply and preservation of the original brief need DEV evidence. |
| Approval and deduplication | `writer.ts` publishes only an approved revision; `d1-writer-repository.ts` has an approval path; `ai-writer.test.ts` verifies an unapproved draft is not publishable. Bot update deduplication is covered in `create-bot.test.ts`. | Double-tap approval, stale button and Telegram delivery ambiguity still need an integrated DEV run for this flow. |
| Model calls and cost | `service.ts` defaults AI and video reviews off, checks key/model/price and daily/monthly spend before calls, and records usage. `openai-provider.ts` calls Responses with `store: false`, bounded response size and request signal. | Runtime settings, configured secret, actual DEV spend and provider behavior are unverified. The fixed control set has not been run against this HEAD. No paid or live call was authorized by this inventory. |
| Data | Migrations 0062, 0071 and 0072 exist; backend integration tests use local D1. Existing code has feedback notes/exclusions and T+72 review storage. | Remote migration history is unverified. Evidence-backed active rules, weekly memory, 6+6 daily reporting and forecasts from the new plan are not established by this inventory. |
| Evaluation | The fixed control set now has 20 tasks: the original 15 plus five new cases. The earlier 15-task run is documented in `run-1.md`; the added tasks are not yet scored. | The owner's 20-brief paired set, five-repeat run, blind comparison, human ratings, actual duration and usage for this HEAD are missing. Engineering cases do not replace owner cases. |

## Priority risks and next checks

1. **P1 entry blocker:** verify DEV's migration 0062 and the API result shape, then record the deployed SHA and time. Local schema success is insufficient.
2. **P1 entry blocker:** run the owner-only Telegram flow on the test bot and channel: `/redactor` → `Учусь играть` without facts → one concrete question → reply with real facts → full draft → edit → approve. Capture redacted update/result evidence and confirm no approval button on the question.
3. Test a double approval, two simultaneous drafts, a stale button, a timeout and a Worker restart against DEV. Classify each plan case as `PASS`, `FAIL` or `BLOCKED` with evidence.
4. Run the fixed 20 tasks and five-repeat check only after checking the DEV budget and model settings. Preserve exact inputs, model, pack revision, outputs, warnings, duration and actual `ai_usage` cost. Obtain the owner's paired briefs and ratings separately.
5. Keep P4 data/prognosis work separate until the actual platform fields and schemas are reconciled; do not treat the T+72 review already in code as the new plan's full analytic pipeline.

## P0 decision

Inventory and the 20-task fixture are complete locally. P0 acceptance is **BLOCKED / EVIDENCE MISSING** for DEV migration, live Telegram, current CI and owner evaluation. No production action, remote migration, deployment or new model call was performed. Next package: P1 after the live P0 gates are evidenced.
