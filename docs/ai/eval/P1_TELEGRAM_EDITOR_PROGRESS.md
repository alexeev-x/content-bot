# P1 Telegram editor — local reliability pass, 2026-10-19

This is a partial P1 result against the [development and test plan](../../ALEXEEV_AI_DEVELOPMENT_AND_TEST_PLAN.md). Starting HEAD: `dd3505b` on `develop`.

## What changed

- A facts question's pending answer is consumed by one conditional D1 update. Two concurrent replies cannot both start a draft or spend model budget. A later explicit reply to the answered question is refused.
- A Worker integration test with real local migrations and a fake model/Telegram API covers `/redactor` → format → question without approval buttons → owner facts → full draft → repeated approval. It also reproduces the concurrent-reply and stale-question defects before the fix.
- The backend bot behavior reference documents the one-answer rule. No API contract or migration changed.

## Evidence and limits

| Check | Result |
| --- | --- |
| Focused integration test, `npm.cmd run test -w @alexeev/backend -- bot-ai-writer.test.ts` | PASS: 3 tests. The two duplicate-generation cases were red before the fix and green after it. |
| `npm.cmd run verify:changed` | PASS: all planned steps. |
| `npm.cmd run verify` after the final test change | PASS: agents, docs, lint, tooling tests, architecture, format, typecheck, backend tests, frontend tests and build. |
| Real model usage/cost | $0 added by this work; tests use a fake provider. |
| Telegram live DEV, migration 0062 on DEV, current CI result | BLOCKED / EVIDENCE MISSING. No remote migration, deployment or live model call was performed. |
| Studio/mobile | Not part of this backend change; not checked. |

The owner-only webhook guard and approved-revision publication guard remain in the existing code. The added test verifies an answered question has no revision and that a repeated approval produces one approved revision. It does not establish live Telegram delivery or a full P1 acceptance result.

**Decision:** NOT READY for P1 acceptance. Next check: a redacted live DEV question → answer → draft → edit → approval run, including duplicate and stale callbacks, followed by the remaining P1 cases. Rollback of this local change is the single commit that adds the conditional claim and its tests.
