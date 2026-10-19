# P4 — daily analytics table, 2026-10-19

The numbers of the daily report (plan §4.1) are computed in `apps/backend/src/modules/content-analytics/daily-table.ts` (pure) and read by `readDailyAnalytics` (`daily-analytics.ts`, exported by the module). There is no endpoint, Studio view or Telegram message yet: P6 renders and delivers it, P5 forecasts from it. No model is called.

## Rules as built

- **Selection:** per platform (YouTube, TikTok), the six latest videos by real `published_at`, never by views; fewer stay fewer; a future `published_at` and duplicate `platform:id` are out. One `as_of` for the whole table: readings after it do not count.
- **Growth:** from the latest successful reading to the one closest to a day before it. «+24ч» (`kind: day`) only for a pair 24 h ± 2 h apart; otherwise the real length (`window`, 6–48 h, shown «+ за N ч»); otherwise `none` (н/д). A counter that went down is `anomaly` with the drop, never a negative growth. Views per hour use the real length.
- **Missing values** are null («—»), never 0. `status`: `no_data` without any reading; `stale` when the latest reading is older than one missed collection (3 h under 72 h of age, 26 h after).
- **Comparison:** the item's own checkpoint views against the median and 25–75% band of the same platform and rubric at the same checkpoint, from at least five clean videos; otherwise the platform curve, marked `weak`. No percentile is invented.
- **Platforms:** `error` when the last collection failed after the last success (rows stay the last readings), `pending` before the first success; the table is `partial` then, or when any row is not `ok`.
- **Not provided:** retention (the TikTok API has none), causes of growth.

## Checks

| Check | Result |
| --- | --- |
| `daily-table.test.ts` — historical fixtures: ±2 h pair, other windows, counter drop, null not 0, stale by age, as_of, selection, comparison strength, short titles | PASS, 9 tests |
| `daily-analytics.test.ts` — 26 hourly collections in a migrated D1, an uncollected TikTok, a failed YouTube collection | PASS, 1 test |
| Real DEV data | NOT RUN: there is no view of the table until P6 |

Known limit: snapshots are written only on success, so a failed collection leaves a gap rather than a failure row; the gap shows as a `window` or `none` growth, and the platform state carries the error.
