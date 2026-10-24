# P9 — independent check of the AI part, 20.10.2026

Plan: [AI plan §2](../../ALEXEEV_AI_DEVELOPMENT_AND_TEST_PLAN.md). Run on `develop` after `523f2f9`, local only (DEV and production untouched). The UI check used mock data; how it looks on DEV is the owner's call.

## Result per section

| § | Check | Result | Evidence |
| --- | --- | --- | --- |
| A | `npm run verify` on a clean tree | PASS | all ten steps green (backend tests 168 s) |
| A | Playwright e2e | PASS after fixing two stale tests | 10 passed, 8 skipped (screenshot-only, need `E2E_SHOT_DIR`); the 1280 editor has no «Все посты» link by design, and an open drawer gives `scrollWidth − clientWidth = −15` (scrollbar room), not a sideways scroll |
| A | D1 per Cron tick, «everything on» (`ai-cron-budget.test.ts`) | PASS | statements / round trips: min 2 daily 27/26, Monday weekly 26/24; min 4·24 lost jobs 16/16; min 8 alerts 23/20; min 9 script prompts 26/23; min 14·34·54 reviews 38/32; min 44 lessons 11/10 |
| A | D1 per queue job | PASS | draft 19, rewrite 20, facts 21, fix 25, chat 12, weekly `daily_review` with the rules summary **48** (8 linked videos, 3 new rules, 4 alerts), style_lessons ≤ 50 (`ai-style-lessons.test.ts`) |
| B | Migrations 0073–0084 on a copy at 0072 with data | PASS | node:sqlite script: all tables and rows kept; new columns NULL on old rows; FK and integrity checks clean; 0083 marks both platforms of an `auto` prompt as `auto`, owner, confirmed and manual links stay `owner`; all migrations apply on an empty database |
| B | `EXPLAIN QUERY PLAN` of the new queries | PASS with notes | lists and Cron reads use indexes; scans remain on small capped tables (`ai_rules`, `ai_style_lessons`) and on `ai_script_prompts.openPrompts` (one row per video, see notes) |
| C | Three chains end to end (`ai-scenarios.test.ts`) | PASS | four weeks day by day → rule «strong» → «Учитывать?» once → rule in the next prompt; five edits → lesson → «Учитывать» / «Нет» (never proposed again); auto link → «✅ Верно» → owner link teaches rules, «Не тот сценарий» removes it. Only the model and the video list are fakes |
| D | Failures (`ai-failures-security.test.ts` plus existing tests) | PASS | model 429/500/503/404/non-JSON/no key: one fetch, no charge, readable bot message; Telegram 403/429/500 on alerts and questions → `failed`, never resent; timeout → `unknown`; lost job, redelivery and overlapping steps covered by their own tests |
| E | Security | PASS after one fix | non-owner session 403 and no token 401 on rules, drafts, reports, settings/operations; `dailyReportHour: 24` → 400; stale `ai:` `rl:` `sp:` `sl:` buttons answer «Эта кнопка устарела.»; every AI `callback_data` ≤ 64 bytes; `/rule` of 301 characters refused; injected orders stay inside data; logs carry no key, task, remark or initData |
| F | Studio sections at 375/1280/1920, light and dark | PASS (mock data) | «Правила редактора», «История черновиков», «Аналитика → Отчёты», «Ежедневный отчёт»: axe WCAG 2.2 AA clean, no sideways scroll, empty and load-error states, Tab reaches each section and Enter opens it with a visible focus ring |
| G | Independent review (qa-security) | DONE | no critical or high findings; notes below |

## Fixed in this run

- An owner remark could close its own `<<<…>>>` fence in the rewrite prompt (`writer-prompt.ts`), unlike the improve prompt; it is escaped now and pinned by a test.

## Open notes (low, not fixed)

- Weekly `daily_review` uses 48 of 50 D1 statements; the retired-rule path is not measured. Any new statement there needs a new budget check.
- `ai_script_prompts.openPrompts` scans the table on minute-9 ticks; one row per video, so it grows slowly. An index on `(status, created_at)` would remove it.
- `itemsOf(format)` reads `content_ai_links` with `LIMIT 500` and no order: past 500 links of one format, newer links can be left out of curves.
- If `alerts.insert` succeeds and `reports.finish` fails, the report stays `waiting` and later ends `EXPIRED` in the Studio although it was sent.
- Owner messages from AI steps go out only through the content-alerts step, which needs at least one analytics source.
- If `finishJob` fails after a draft was shown, the lost-job notice may invite a second paid request.
- A fast double tap on «Ещё вариант», «Короче» or «Смешнее» makes two paid rewrites.
