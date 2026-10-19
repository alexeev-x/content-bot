# P1 Telegram editor — saved facts and stale actions, 2026-10-19

Partial P1 work after `d7564d6`. The owner answer to a `needs_facts` question is now saved in the same D1 AI writer before OpenAI is called (migration 0073). A provider error keeps that answer and presents an explicit retry button; two retries cannot claim the failed attempt together. If a Worker stops while processing, the owner can reply to the same question again to get the recovery button and explicitly retry after 60 seconds (the model timeout is 25 seconds). No second AI or separate memory was added.

Older cancel buttons cannot clear a newer edit or feedback wait. Hook, rewrite, and reason buttons carry a short revision token; stale buttons cannot change or pay to rewrite a later owner edit, or record feedback against it. A D1 parent guard prevents a concurrent hook from replacing a newer revision, and a hook change remains AI provenance. If Telegram delivery fails after the model saved a ready draft, the retry button shows that same draft without another model call. An edit button on an approved draft stops before asking the owner for text. A D1 guard prevents adding a revision after approval, and approval retries a fresh read when an owner edit wins the race. An overlong task plus facts is refused clearly without a model call or silent truncation.

## Verification

| Check | Result |
| --- | --- |
| Focused Worker tests (`ai-writer`, `bot-ai-writer`, `bot-ai-feedback`) | PASS locally: 40 tests with real migrated D1 and fake Telegram/OpenAI; provider failure, interrupted Worker recovery, Telegram edit failure and ready-draft redelivery, concurrent retry, owner edit and approval, stale hook/rewrite/reason/cancel buttons, and revision races covered. |
| Full `npm run verify` | PASS locally on the final code tree: agents, docs, lint, tooling-tests, architecture, format, typecheck, backend-tests, frontend-tests, build; `verify: all green` (2026-10-19). |
| Independent R3 review | PASS for local code after full verify: first reviews found stuck `processing`, stale hook/reason/rewrite, and lost ready-draft delivery; regression tests close them. P1 acceptance remains BLOCKED on live DEV evidence. |
| DEV migration 0073 and live Telegram run | BLOCKED / EVIDENCE MISSING until CI applies the migration and the owner runs the test chat. |
| Real OpenAI calls and cost | Not run; tests use a fake provider, incremental cost $0. |

## DEV acceptance instructions for the owner

1. In GitHub Actions, check that the `develop` workflow for this package is green and that its DEV D1 migration step applied 0073 before the Worker deploy. If either step failed, stop the live test and report the run link.
2. In the separate DEV test bot, open `/redactor`, choose «Учусь играть», and send a topic without personal match facts. Check that the bot asks one specific question with no approval button. Reply with a real match detail; confirm a full draft keeps the topic and detail.
3. In Studio DEV settings, temporarily disable AI, answer a new facts question, and confirm the bot offers «Повторить по сохранённому ответу» without losing the answer. Re-enable AI, tap retry once, and confirm it uses the saved detail. This exercises the unavailable-settings path, not a live OpenAI outage; the latter remains unverified. Do not change secrets or production.
4. Edit the generated text and approve it. Tap approve again: there must be one approved version. If an old «Хук» or feedback reason button remains in a Telegram client, it must say it is stale and leave the owner's edit unchanged. Tap an old «Отмена» or «Без пояснения» button after starting a newer wait: the newer wait must remain active.
5. Record the deployed SHA, time, redacted Telegram message IDs, the AI settings/cost before and after, and PASS/FAIL for TG-01–04, TG-08–09, TG-12 and TG-14. Keep private facts and IDs out of Git.

The live test, current CI result and the remaining P1 cases are not evidenced here. P1 is **NOT READY** for acceptance. Production migration remains a manual owner action, not part of this package.
