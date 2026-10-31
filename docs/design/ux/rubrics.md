# §3.11 Рубрики

## 3.11 Рубрики `/rubrics`
- **Purpose:** when each of the channel's rubrics goes out and why, in Moscow time (the channel's slots are Moscow slots). Stage 3 shows the forecast only; the scheduler's own controls (switch, pause, rest, «Пропустить слот») come with its later stages (docs/scheduler/MASTER-PLAN.md §13 answer 16: the section is built to the maximum).
- **Banner:** «Это прогноз» while the scheduler only forecasts: the plan is computed on each opening, counts the posts already in «Публикации», and event rubrics appear when their event happens.
- **Calendar:** «Месяц» | «Список» (SegmentedControl, local state). Month: Monday-first seven columns, each forecast day a cell with its slots («19:04 Признавайтесь» plus picture and poll marks with text for screen readers); days outside the 35 are dashed. Under 720 px the days stack and only the filled ones show. List: the filled days, each slot with its reason («Отдых 14 дн. прошёл»). No «Неделя» view (owner, 31.10.2026).
- **Unavailable rubrics:** a Disclosure «Не могут выходить на этом сервере: N» naming each rubric and what it lacks (Browser Rendering, ИИ, STRATZ, база матчей).
- **States:** loading — a calendar-shaped skeleton with `aria-busy`; error — concise message, request id, retry (a safe GET); empty — «В ближайшие 35 дней рубрик нет» with the reason; 401/403 as everywhere (shell).
- **Navigation:** «Рубрики» in the sidebar and in «Ещё» on a phone.
