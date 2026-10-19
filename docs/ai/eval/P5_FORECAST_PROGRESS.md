# P5 — forecasts and backtest, 2026-10-19

Deterministic forecasts of a video's total views at +24 h, +72 h and +7 days (plan §5) in `apps/backend/src/modules/content-analytics/forecast.ts`, and a rolling-origin backtest in `forecast-backtest.ts`. Code makes the numbers; a model may only explain them later (P6). Nothing is stored or shown yet: P6 stores each forecast with its report and scores it when the horizon comes.

## Method `decay-v1`

- From the readings up to the origin `t` only: at least 3 successful readings in the last 48 h, the latest not stale (3 h under 72 h of age, 26 h after), no counter drop; otherwise `insufficient_data` with the reason and no numbers.
- Rate: views per hour from the reading closest to 24 h before the latest one (at least 6 h). Growth slows as 1/age: gain = rate·age·ln((age + h)/age). One stated assumption, no fitted curve.
- Band: 0.4–2.2 × the expected gain (0.25–3 × with fewer than 6 readings); growth is clamped at 20 × the current views. The factors are what a real backtest should calibrate; any change gets a new method name.
- Simple methods for comparison: views stay (`flat`) and the current rate goes on (`linear`).

## Backtest

Origins every 24 h of a video's age; a horizon is scored only when it has passed and a reading lies within 2 h (24 h) or 6 h (72 h, 7 d) of it. Per platform × horizon × age bucket: scored and declined counts, inside/under/over the band (a fact under the band is a miss), median absolute percentage error of the method and of both simple methods.

| Check | Result |
| --- | --- |
| `forecast.test.ts` — FC-01 same input same numbers, FC-02/03 decline, FC-04 future readings change nothing, FC-05/06 only reached horizons with a fact, FC-08 wide band and clamp, FC-13 sizes and simple methods, FC-14 under the band is a miss | PASS, 6 tests |
| Backtest on the owner's real readings | NOT RUN — no agent access to DEV D1; a run over 90 days of readings also needs more CPU than one Free-plan request, so it belongs to the Studio view (P8) or a local export |

**Caveat:** the fixture that shows `decay-v1` beating `linear` is built on a 1/age curve, the method's own assumption; it proves the code, not real accuracy. No accuracy is claimed until a backtest on real readings.
