# Rubric scheduler — MASTER PLAN (architect, 30.10.2026)

Planning only: nothing below is built. This file is the one ordered plan the team starts from. It merges `area-backend-core.md`, `area-backend-rubrics.md`, `area-backend-analytics.md`, `area-frontend.md`, `area-design.md` (all in this folder) with `../architect-plan-v2.md` (incl. «v2.1 required fixes» N1–N11), `../review-backend.md`, `../review-qa.md`, `../release-model.md`, `../research-cadence.md`, `../research-prior-art.md`, `../ui-ia.md`, `../ui-mock/*`.

**Precedence.** 1) owner decisions (`docs/RUBRICS_SCHEDULER.md`, `docs/DECISIONS.md` rows of 30.10.2026); 2) this file, mainly §2.2 «resolved contradictions»; 3) the area files as normative annexes for detail (state matrices, DDL comments, per-rubric rule code). Where an annex says something §2.2 overrides, §2.2 wins. Nothing in the annexes is dropped unless §2.2 says so. Line numbers of real code quoted in the annexes were checked by their authors on 30.10.2026; re-check before editing.

---

## 1. Сводка для владельца

**Что появится.** Рубрики сами выходят в Telegram-канал по московскому времени, без вашего подтверждения, только на проде; на DEV — «репетиция» в тестовый канал без ИИ. В меню новый раздел «Рубрики»: Календарь (что, когда и почему выйдет, что заменилось), Рубрики (статус каждой, отдых, «банк исчерпан», чего не хватает), карточка рубрики, позже Сравнение и Комментарии. Общий выключатель и пауза каждой рубрики — там же. Ручные «Рубрики Telegram» (метки, выбор в редакторе, панель в Аналитике) удаляются при первом экране раздела.

**Как работает.** План на сегодня+завтра пересчитывается каждые 30 минут; слоты 12:30 и 19:00 МСК (±20 мин), окно 08:00–23:00, примерно каждый пятый пост пробует другой час. Не больше 3 постов в день вместе с новостями (картинка + её опрос = один пост), между постами ≥ 2 ч, интерактив ≤ 1 в день. Пост собирается за 3 часа до слота; если не собрался — следующий кандидат того же вида, иначе другого, иначе открытка-заполнитель, иначе слот пуст; отдых неудачной рубрики не сгорает. Пост, который Telegram мог принять, но не подтвердил, никогда не отправляется второй раз («Требует проверки», сверка в «Публикациях»). Каждая рубрика соблюдает свои внутренние правила (без повторов банка до конца круга, герой не чаще раза в 72 ч, и т. д.); рубрика попадает в прод, только когда все её правила запрограммированы. Ошибки приходят вам в бот один раз в день на причину, с шагом, сервисом, HTTP-кодом и текстом; не больше 6 в день, дальше одна сводка.

**Этапы.**
- 0 — вынести сборку рубрик из «Тестирования» в общий код (без изменений для вас).
- 1 — доработки публикации: срок «не позже», опрос с картинкой внутри, закрытие опросов ботом. Миграция 0117.
- 2 — бот слушает реакции, голоса и комментарии канала. Миграция 0118.
- 3 — расчёт плана без записи: раздел «Рубрики» с прогнозом на 5 недель; ручные «Рубрики Telegram» удаляются.
- 4 — настоящие слоты, сборка, выпуск, выключатель; репетиция на DEV 3 дня; затем прод: выключатель по умолчанию выключен, вы включаете. Первые рубрики на проде — текстовые и опросы (15, 16, 18, 24, 25, 30). Миграция 0119.
- P — Browser Rendering на проде (через неделю чистой работы этапа 4): картиночные рубрики 04, 10, 17, 19, 22, 23, 26–29. Без миграции.
- 5 — цепочка патча (01, 02, 03, 07), ставка 06, Валв-тайм 08, Открытка 31, «Первым угадал» в 04, проверка похожих текстов. Миграция 0120.
- 6 — оставшиеся рубрики с ИИ и разовыми фактами: 05, 09, 11, 12, 13, 14, 20, 21. Без миграции. 6b — проверка похожести по смыслу не раньше чем через 4 недели данных.
- 7 — аналитика рубрик, темы комментариев, блок «Рубрики» в понедельничном отчёте. Миграция 0121.
- 8 — обучение отдыха и часов (4 недели только советы). Миграция 0122.
- 9 — уборка: временная страховка 0117 и старые таблицы ручных рубрик (0125).
- 10 — недельный тест на DEV: все рубрики за неделю, нарочные сбои, журнал «Репетиция» в /lab. Миграция 0123 (только DEV пишет в неё).

**Что делаете вы (агенты этого не делают).**
1. Перед каждым PR develop→main с новой миграцией — применить её на проде: Actions → «D1 migrations» → production (0117, 0118, 0119, 0120, 0121, 0122, 0123, 0124 — индекс слотов, позже 0125). Без 0117 на проде публикации шли бы без защиты (есть временная страховка), без остальных — раздел пишет «не применена миграция».
2. После этапа 2: сделать бота админом группы обсуждения канала (или выключить privacy в BotFather), задать секрет `AUDIENCE_HASH_KEY` на DEV и проде, нажать «Подключить бота» один раз.
3. Этап 4 (прод): включить «Автопубликация рубрик» в разделе «Рубрики» и выбрать канал (подставлен канал автопубликации).
4. Этап P: деплой с привязкой Browser Rendering на проде (правку `wrangler.jsonc` делают агенты, деплой — ваш PR); дневной лимит в коде: прод 12 мин, DEV 4 мин.
5. Этап 5: загрузить фоны «Открытки» в R2 (`--remote` — только вы) и указать час каждой открытки.
6. Этап 6b: разрешить Workers AI (эмбеддинги) после 4 недель данных; стоимость и лимит назовём до пробы.
7. Вопросы §13 отвечены 31.10.2026.

---

## 2. Decisions

### 2.1 Index (links only; never restated here)
- Product rules: `docs/PLAN.md` §2 (pool, budget, rest, news first, picture rule).
- Scheduler items 1–9 incl. 8a (MSK), 8a1 (learned hours), 8b (calendar posts): `docs/RUBRICS_SCHEDULER.md` «For every rubric».
- Per-rubric inner rules 01–31: same file, «Per approved rubric», «In work (06–10)», «Release plan» (06 picture, 07 picture, 11, 12), «Inner rules, 13 onward».
- Common mechanisms (bank runs out + exact texts, start-up, a rubric that did not go out, weekly report block, picture+poll = one post, semantic similarity deferred 4 weeks, comments retention): same file, «Common mechanisms».
- `docs/DECISIONS.md` 30.10.2026: manual «Рубрики Telegram» removed in the UI stage; rubric posts automatic on prod with off switch; DEV rehearsal without AI + prod BROWSER with a daily cap; stats bridge on Render. 29.10.2026: Workers Paid $5, second D1 `content-stats`, Workflow. 13.10.2026: pausing stops future runs only, scheduled publications stay dispatchable. 06.10.2026: delete never removes the Telegram message; deletes ask for confirmation.
- Draft planner rules R1–R15 and the coordinator edits (≤ 3 posts/day incl. news, rest ladder): `../release-model.md` — adopted where the docs are silent; the docs win where they differ (§2.2 rows 3–4).
- Research inputs: `../research-cadence.md`, `../research-prior-art.md`.

### 2.2 Resolved contradictions (what wins and why)
| # | Topic | Sources disagree | Decision | Why |
|---|---|---|---|---|
| 1 | Comment text retention | brief + all areas: 7 d, open; `RUBRICS_SCHEDULER.md` «Comments» (uncommitted working copy): 10 d with owner quote | Code uses one constant `COMMENT_TEXT_DAYS = 10` (ingest horizon 10 d, thread rows 14 d); counts and daily summaries kept for good; 04 first guesser's @username only on that answer post. Confirmed by the owner 30.10.2026: 10 days | the doc is the newest owner record; one constant makes any answer a one-line change |
| 2 | 25 «Ты на линии» at bank end | core: new round + notice (Q); rubrics: pause | **pause** + owner message | owner doc: the pause applies to «guessing rubrics whose answer is known once out (26 and the like)» — a quiz is one |
| 3 | 12 rest | release-model ladder 30 d | **9 d** | docs inner rules (owner quote «раз в 8–9 дней») |
| 4 | Posting window | release-model R3 «не позже 21:00» | **08:00–23:00 MSK** | owner 8a1 «trial posts cover the whole day 08:00–23:00» |
| 5 | Capability names | core: browser/openai/stratz/statsDb; rubrics: 6 needs | internal `Need` = `browser, ai_text, ai_image, ai_upscale, stratz, stats_db`; DTOs show 4 provider flags (`openai` covers ai_*) | DECISIONS lists writer texts, AI scenes and upscale separately |
| 6 | Facts shape | core closed `RubricFacts`; rubrics envelope `{v:1, heroIds, variant, look, bankKey, round, topics, patchChain, onceKeys, extra}` | rubrics envelope, per-key Zod in `modules/rubrics/facts.ts`, ≤ 16 KB; analytics `slices` derived (hero = sole hero, line = bankKey, look) | covers every inner rule and the analytics slice contract |
| 7 | Where history lives | core 0121 `rubric_post_facts`; rubrics promoted columns + `rubric_once_keys` | history = `rubric_slots.facts_json` (sent ∪ live); `rubric_once_keys`, `rubric_overrides`, `sig_text`/`sig_lead` columns all in **0119**; no `rubric_post_facts` table | one store, fewer migrations; signatures/once keys are cheap expand-only additions |
| 8 | Bank order | core: slot-turn counter over `shuffledOrder` (breaks on bank growth, F2) | rubrics `bank-pick.ts` (history, `fnv1a(round:key)`, new entries first) in the scheduler path from stage 4; lab keeps `turns` | owner: «no repeat until the whole bank», «new entries first» |
| 9 | When a rubric may post on prod | core `needsHistory`; v2 «needs ⊆ capabilities» | both: `RUBRIC_META.innerRulesReady === true` (pinned by test) **and** needs ⊆ capabilities | owner rules are final; a rubric never posts with half its rules |
| 10 | Stage order / browser | v2: P last, owner question | DECISIONS answered («подключи на проде»): P right after a clean week of stage 4; ledger tables in 0119 (DEV rehearsal already renders) | most rubrics are pictures; DEV and prod share the account allowance from day one |
| 11 | Hour exploration | core: rate 0 until stage 8 | ~1 in 5 pool slots from prod go-live (deterministic, invariants on final times) | owner 8a1; stage 8 needs trial data already collected |
| 12 | Rehearsal destinations | v2.1 N9: {owner chat, test chat} | allowlist = **{`RUBRIC_REHEARSAL_CHAT_ID`} only** | DECISIONS «posts only to the test channel»; memory: no unasked samples to the owner chat |
| 13 | Rehearsal AI | N9 «spends the same OpenAI balance» | zero AI calls in rehearsal (capability `openai=false`) | DECISIONS «без ИИ» |
| 14 | Comments/audience stage | v2: comment tables 0122 stage 7 | audience capture (reactions, polls, comments) in **0118 stage 2** | baselines need ≥ 28 d of threads; analytics area |
| 15 | Audience dedup | v2: `webhook_updates`/`audience_update_seen` | idempotent writes by key, no dedup table | analytics §3.1: a foreign flood writes nothing |
| 16 | «0 audience updates» notice | v2 scheduler health | owned by audience `ra:health` (one notice/day); scheduler `/status` shows a line only | one fact, one place |
| 17 | Learn step | v2 scheduler marker `learn` | analytics `ra:learn`; `rubric_step_marks.step` ∈ plan, health, purge | no dead CHECK values |
| 18 | `rest_source` | analytics needs it; core 0119 lacks it | `rubric_settings.rest_source`, `rest_changed_at` in 0119 | learning applier is conditional on it |
| 19 | Final poll votes | rubrics `final_votes_json`; core poll_close facts; analytics `recordFinalPoll` | builders read the `poll_close` slot's `facts_json` (stage 4); analytics also gets `recordFinalPoll` into `tg_polls` when 0118 exists | no extra column; works without stage 2 |
| 20 | Poll closing | docs item 5 «every poll gets `open_period`»; core F7: Bot API seconds ≤ 600 | stage 1 re-reads the Bot API changelog (memory rule); if `open_period`/`close_date` can express 24 h / 7 d, set it as well; the `poll_close` slot with `stopPoll` closes every poll regardless | the intent «polls close, votes kept» holds either way; doc item 5 reworded only when built |
| 21 | Poll flags over HTTP | core adds flags to `postPollSchema` | stored schema gets `shuffleOptions`, `pictureInPoll`; the HTTP input schema does **not** (400 on unknown keys); `gapMs` application-only | studio must not create picture-polls the dispatcher was not built for |
| 22 | Contract file names | core `rubric-scheduler.ts`; frontend `rubrics.ts` | `apps/contracts/src/rubric-keys.ts` (keys + titles, single source), `rubric-scheduler.ts`, `rubric-analytics.ts`; frontend slice `features/rubrics/` | keys/titles today exist in 3 copies |
| 23 | Concurrency token | frontend `expectedVersion`/`STALE_VERSION` | `revision` in body, `409 CONFLICT reason STALE_REVISION` | project convention (contracts ai.ts, destinations.ts, media.ts) |
| 24 | 503 reason | core `SCHEDULER_NOT_READY`; analytics `MIGRATION_PENDING` | `503 UNAVAILABLE reason MIGRATION_PENDING` everywhere | one reason, one copy |
| 25 | Analytics endpoint paths | frontend `/rubrics/compare…`; analytics `/rubric-analytics/*` | `/api/v1/rubric-analytics/{compare,posts,comments,learning}`; card blocks for hours/rest history read `learning` | backend module boundary; frontend maps |
| 26 | Forecast compute | frontend: serve from plan step | per request, pure `plan()`, `Cache-Control: private, max-age=300` | ~10 reads, no stored copy |
| 27 | Primitive names | frontend `CalendarMonthGrid`, `DivergingMeter` | design names: `MonthCalendar`, `AgendaList/AgendaRow`, `ReasonChip`, `RatioBar/RatioValue`, `HeatGrid`, `SliceCard`, `ComparisonRow/List`; frontend `SlotRow`, `PostCompare`, `SliceList` compose them | design-system owns `shared/ui` |
| 28 | Slot labels | mock/L7, frontend, design differ | one table §9.3 (canonical page-spec words: «Опубликовано», «Требует проверки», «Публикуется»); `skipped` «Пропуск» (content skip), `empty` «Не собран» | one mapping everywhere |
| 29 | Calendar layout | frontend: sticky agenda, viewport 1100; scroll heat-map | design: no sticky agenda, two columns when container ≥ 820 px, transposed heat grid < 560 px | WCAG 2.4.11 focus not obscured; no hidden scrollers |
| 30 | «Неделя» view | frontend builds it; design Q1 | ship Месяц + Список; Неделя only after the owner answers Q14 | adds little over month + agenda |
| 31 | Manual rubrics | ui-ia: merge or «Свои метки» | deleted (DECISIONS 30.10), at F1 = first UI stage, one cross-area commit | owner decision |
| 32 | Contract commit | frontend: additive endpoints may land first | AGENTS: contract + backend handler + contract tests + frontend API layer (fetchers, types, fixtures) in one commit; screens may follow | root `AGENTS.md` Git rule |
| 33 | Exclusion pairs | core `exclusions.ts` table; rubrics META `sameDay/sameWeek/apart` | META is the only source; scheduler domain gets descriptors mapped in `app/`; test pins every doc pair + symmetry | one fact one place |
| 34 | Families | core vs rubrics enums | META `families: Family[]` (21 is stats+scene): patch 01,02,03,06,07,08 · stats 10,12,19,20,21,29 · scene 17,21,22,23,31 · cosmetic 09,11 · guess 04,25,26 · text_bank 13,14,15,18,30 · joke_poll 16,24; 05, 27, 28 none | release-model R8 + docs pairs |
| 35 | MSK helper | core: in scheduler domain, no Intl; analytics: Intl | `apps/backend/src/shared/msk-time.ts`, fixed UTC+3 arithmetic, used by scheduler, rubrics, analytics | modules may not import each other; no DST since 2014 |
| 36 | First-guess matcher | rubrics `comment-guess.ts`; analytics `first-guess.ts` | `modules/rubrics/first-guess.ts` + `hero-aliases.ts` (AI_LEXICON + `spokenHeroName`); a negated mention counts (owner rule as written); a comment naming ≥ 3 heroes is spam; first by `created_at`, then message id | merged rules |
| 37 | 04 first guess stage | core 2/7, rubrics 7, analytics 5 | stage 5 (needs only 0118 + slots); before it the answer is plain | earliest point with data |
| 38 | Stage 0 acceptance | core: «press three lab rubrics» | agents build samples on the local Worker to a file; the owner presses «Прислать» on DEV if he wants | memory: owner presses samples; local samples to a file |
| 39 | Notice store | v2 `claimFailureNotice` | scheduler `rubric_notices` (day-keyed); audience uses `claimFailureNotice` only for `ra:silent` | core F10 |
| 40 | Bets | core: resolve sets `resolved_at` | two-phase: `claimed_at` (patch/timeout claim) and `closed_at` (result published); one open bet = partial UNIQUE `WHERE closed_at IS NULL` | doc: «the bet closes only when its result post is published» |
| 41 | 0117 safety | core Q5 | both: owner applies 0117 before main **and** a temporary V0 SQL shim, deleted in stage 9 | publishing safety; not an owner-level choice |
| 42 | Rehearsal stats rubrics | v2 special case | no special case: DEV has no `STATS_DB`, rehearsal sets `stratz=false` | capability map |
| 43 | Exhaustion of hero pools | rubrics: `new_round` | 17, 23 heroes, 22 tellers, 12/20/21 rounds: silent new round; 22 form banks, 13–16, 18, 24, 27, 28, 30, 31 fillers: new round + owner text; 25, 26: pause | doc names joke banks; a hero pool is not a bank |
| 44 | Stage of similarity / chain | rubrics: chain AI outputs need lexical similarity | lexical similarity lands in stage 5 with the chain | 01, 02, 06, 07, 08 are AI-written |
| 45 | 13 «different emoji pairs with 24» | rubrics C13: moot | `sameWeek` exclusion makes the meeting impossible; no extra code | the rule is enforced, the clause never triggers |
| 46 | Media in stage 4 | core: stage 4 has no media | R2 media path in stage 4 | DEV rehearsal is mostly picture rubrics |

---

## 3. Architecture and module map

### 3.1 Modules (modular monolith; no module imports another; `app/` wires by hand in `container.ts`)
| Module / place | Status | Owns |
|---|---|---|
| `modules/rubric-scheduler/` | NEW | domain (pure: triggers, constraints, select, plan, invariants, slot-machine, release-classify, fallback, breakers, capabilities, seeding, bank-exhaustion, notice-policy); application (plan, claim-build, record-build-result, release-slot, project-slots, close-polls, check-health, purge, settings, read-calendar, read-rubrics, read-slot, read-forecast, ledger); infrastructure (D1 repos for slots, settings, markers, breakers, notices, once keys, overrides, budget, leases, hour slots) |
| `modules/rubrics/` | CHANGED | builders, `RUBRIC_META`, facts Zod, degradations, `bank-pick`, `inner-rules`, `seeded-random`, `similarity`, `topics`, `patch-chain`, `valve-values`, `find-identity`, `bet`, `first-guess`, `hero-aliases`, `workshop-pick`, `calendar-rules`, `greeting-card(s)`, `bank-index.generated.ts` |
| `modules/audience/` | NEW (stage 2) | `tg_*` tables, webhook ingest, setup check, freeze, purge, reads |
| `modules/rubric-analytics/` | NEW (stage 7/8) | scores, comparisons, themes, week block, learning advice/apply via scheduler ports |
| `modules/publishing/` | CHANGED (stage 1) | `not_after`, `gapMs`, poll flags, `external_poll_id`, `PollStopper`, read side for the scheduler |
| `modules/content/` | CHANGED | one photo on a `pictureInPoll` post |
| `modules/content-analytics/` | CHANGED | `readTelegramAgeSamples`, weekly-report block, removal of manual rubric repo |
| `modules/ai/` | CHANGED | `writeRubricCaptionTyped`, `rules` input, bank-style writer (13/14/20), `comment-themes.ts` |
| `modules/dota`, `integrations/steam-public`, `integrations/stratz`, `integrations/telegram` | CHANGED | read exports (patch, hero changes, announcements incl. `gid`), `STRATZ_GAP_MS` export, `stopPoll`, update kinds |
| `src/shared/msk-time.ts` | NEW | MSK calendar math (§2.2 #35) |
| `app/rubric-build/` | NEW (stage 0) | `sources`, `build-post`, `scene`, `photos`, `payload`, `types` (`BuiltRubricPost`), `ports` (lab adapter vs pure scheduler adapter) |
| `app/rubric-scheduler/` | NEW | `runtime`, `tick`, `wiring`, `capabilities` |
| `app/workflows/` | NEW files | `rubric-actor` (`RUBRIC_ACTOR='rubric-scheduler'`), `rubric-build`, `rubric-release`, `rubric-project`, `rubric-notices`, `rubric-analytics` |
| `app/bot/audience-branch.ts`, `app/rubric-routes.ts`, `app/rubric-analytics-routes.ts`, `platform/security/deterministic-uuid.ts` | NEW | adapters |

Dependency rules (`.dependency-cruiser.cjs` unchanged; it already enforces them): domain imports no platform/integrations/grammY/hono; `modules/rubrics` never imports `modules/rubric-scheduler` (planner sees rubrics only through `RubricDescriptor` mapped in `app/`); analytics reads scheduler data only through consumer-owned ports (`RubricPostSource`, `RestSettings`, `HourPlan`, `WeekSlotsSummary`).

### 3.2 Ports (consumer-owned; bound in `app/container.ts`)
Scheduler consumes: `RubricSlotRepository`, `SettingsRepository`, `MarkerRepository`, `BreakerRepository`, `NoticeRepository`, `ChannelLoad` (publishing `listRecentPublications` ∪ content-analytics channel post times, dedup by message id), `DotaState` (patches, hero-change counts, announcements, recent finds), `RubricCatalog` (META, titles, bank index), `CapabilityReader`, `PublicationGateway` (create, `findPublicationByPost`, `readPublicationOutcomes`), `PostGateway` (create/approve/delete/exists), `PollStopper`, `OwnerNotifier`, `AudienceReader` (null until stage 2). Rubric builders consume `RubricSources` + new `patchText`, `announcements`, `comments`, `writer`, `history`. Analytics consumes the ports of `area-backend-analytics.md` §2.1; audience consumes `AudienceTargets`, `TelegramChatApi`.

### 3.3 Locks (scheduler acts only when all hold; codes shown in `GET /rubrics/status`)
`DEV_NO_REHEARSAL` (lab build without rehearsal) · `VAR_OFF` (`RUBRIC_SCHEDULER` not exactly `"on"` on prod / `"rehearsal"` on DEV; zero D1 rows) · switch off (D1 `rubric_scheduler_settings.enabled`, default 0) · `PUBLISHING_OFF` / `BOT_NOT_CONFIGURED` (N7) · `DESTINATION_MISSING` / `REHEARSAL_TARGET_MISSING` · `CRON_OFF` (DEV: lab master Cron + BackgroundJob `rubricScheduler`) · `SCHEMA_BEHIND` (0117 shim active or 0119 missing ⇒ off this tick, one warn log, one owner notice/day). Per-rubric `rubric_settings.enabled` is the finer switch. Off: live pre-release slots cancelled, unpublished posts deleted, released continue (DECISIONS 13.10.2026).

### 3.4 Endpoints (skill `contract-change`; owner-only, session guard + `requireOwner`, `z.strictObject` inputs, UTC ISO instants, MSK `YYYY-MM-DD` days; no new `ApiErrorCode`, reasons in `details.reason`)
| Stage | Endpoint | Purpose | Errors (reason) |
|---|---|---|---|
| 3 | `GET /api/v1/rubrics/status` | mode (`live`/`rehearsal`/`unavailable`/`forecast_only`), enabled, effective, locks, transition, pendingCancel, liveSlots, next, destination, lastPlanAt, planStale, capabilities{browser,openai,stratz,statsDb}, browserBudget{usedToday,capToday} (stage 4), revision | 401, 403, 503 `MIGRATION_PENDING` (stage 4+) |
| 3 | `GET /api/v1/rubrics/forecast` | 35 MSK days of pure `plan()` | 401, 403 |
| 4 | `PUT /api/v1/rubrics/scheduler` `{enabled, destinationId?, revision}` | switch; off sets `off_cleanup_done=0`, answers `transition:'disabling'` | 400 `DESTINATION_REQUIRED`/`DESTINATION_NOT_ALLOWED`, 409 `STALE_REVISION`, 409 `UNAVAILABLE_HERE`, 503 |
| 4 | `GET /api/v1/rubrics/calendar?from&to` (≤ 42 d) | `SlotDto[]` (no `poll_close`), `ChangeDto[]` (replacement/moved/skip, last 7 + next 7 days), `oldestDay` | 400 span, 503 |
| 4 | `GET /api/v1/rubrics` | `RubricListItem[]` (state active/paused/waiting_event/bank_exhausted/unavailable/breaker, rest, trigger text, last/next, bank{total,used,round,kind}) | 503 |
| 4 | `GET /api/v1/rubrics/{key}` | item + last 8 slots + stage blocks (`bet` 5, `innerRules` 6) | 404 `RUBRIC_NOT_FOUND` |
| 4 | `PATCH /api/v1/rubrics/{key}` `{enabled, revision}` | pause/resume; resume sets `last_sent_at = now − rest` | 404, 409 `STALE_REVISION` |
| 4 | `GET /api/v1/rubrics/slots/{id}` | attempts (step, provider, HTTP, code, message), candidates, facts, preview, times, publication | 404 `SLOT_NOT_FOUND` |
| 6 | `POST /api/v1/rubrics/{key}/rechecks/{entryKey}/clear` `{revision}` | owner clears a 14 «перепроверить» entry (Q8) | 404, 409 |
| 2 | `GET /api/v1/bot/status` additive `audience{…}`, `webhook.allowedUpdates` | setup state | – |
| 4 | `settings` contract: `BACKGROUND_JOBS += 'rubricScheduler'` (default false) | DEV master | – |
| 1 | stored post poll: `shuffleOptions`, `pictureInPoll` (not in HTTP input) | – | – |
| 7 | `GET /api/v1/rubric-analytics/compare?days=7\|30\|90`, `/posts?rubric&days=30\|90\|all`, `/comments?days&rubric?` | ranking, hours heat, coverage; per-post × and slices; themes | 400, 404, 503 `MIGRATION_PENDING` |
| 8 | `GET/PUT /api/v1/rubric-analytics/learning` `{applyEnabled}` | mode advise/apply/off, rest + hour advice/history | 503 |
| 3 | removed: `/api/v1/content-analytics/rubrics…`, `/posts/:postId/rubric` + DTOs `contentRubric*`, `contentPostRubric*`, `CONTENT_RUBRICS_MAX` | owner removal | – |
DTO field lists: `area-backend-core.md` §17 (scheduler), `area-backend-analytics.md` §12 (analytics), with §2.2 #23–25 applied. Frontend `shared/api/error-kind.ts` + `src/test/error-matrix.test.ts` get `MIGRATION_PENDING`, `RUBRIC_NOT_FOUND`, `SLOT_NOT_FOUND`, `UNAVAILABLE_HERE`, `DESTINATION_REQUIRED`, `DESTINATION_NOT_ALLOWED` (STALE_REVISION exists). `docs/API_CONTRACTS.md` gets a «Рубрики» section (names and meaning only).

---

## 4. Data model per migration (expand-only; UTC ms; skill `d1-migration`; EXPLAIN QUERY PLAN for every new query path; numbers by landing order — if the order changes, renumber before commit, never after push)

**0117 `publishing_not_after_poll_id`** (stage 1; touches shared dispatch SQL ⇒ owner applies on prod **before** the develop→main PR).
`jobs.not_after INTEGER CHECK (NULL OR > 0)`; `jobs_not_after_idx (not_after, id) WHERE not_after IS NOT NULL AND status IN ('pending','retry_wait')`; `publications.external_poll_id TEXT CHECK (NULL OR length 1..64)`; `publications_poll_idx WHERE external_poll_id IS NOT NULL`. DDL: `area-backend-core.md` §4.1. `DUE_JOBS_SQL` and `claim` add `AND (not_after IS NULL OR not_after >= ?now)`; V0 shim (§2.2 #41).

**0118 `audience_signals`** (stage 2): `tg_chats`, `tg_message_reactions`, `tg_polls` (+ `tg_polls_message_idx`), `tg_comment_threads` (+ post, age indexes), `tg_comments` (+ post, age indexes). DDL: `area-backend-analytics.md` §5.1. Retention constants change only: text/username/author_key purged at `COMMENT_TEXT_DAYS` (10), threads at 14 d; counts kept.

**0119 `rubric_scheduler`** (stage 4). From `area-backend-core.md` §6.1, with these changes:
- `rubric_scheduler_settings` (singleton: `enabled` 0, `destination_id`, `horoscope_anchor_week`, `off_cleanup_done`, `revision`, `updated_at`).
- `rubric_settings`: as core + `rest_source TEXT NOT NULL DEFAULT 'default' CHECK IN ('default','learned','manual')`, `rest_changed_at INTEGER`; `paused_reason CHECK (NULL OR 'BANK_EXHAUSTED')`; `rest_days`/`base_rest_days` `CHECK BETWEEN 7 AND 60` (H8).
- `rubric_slots`: 16 statuses (`planned building ready released waiting_parent unknown` live; `sent partial unresolved send_failed missed empty skipped yielded cancelled superseded` terminal), kinds `pool event anchor follow_up poll_close`, `next_action_at`/`deadline_at NOT NULL`, `build_json` ≤ 64 KB (N3), `facts_json` ≤ 16 KB, `explore`, `manual` (N4), + `sig_text BLOB`, `sig_lead BLOB` (stage 5 fills). Indexes: `rubric_slots_dedupe_uq` partial over live + `sent partial unresolved skipped`; `rubric_slots_at_uq` partial (kind ≠ poll_close, live + sent/partial/unresolved); due index over live; `(rubric_key, slot_at DESC)`; `(msk_day, slot_at)`; `publication_id`; `parent_slot_id`.
- `rubric_slot_attempts` (90 d; step ∈ capability,data,writer,similarity,scene,render,photo,store,release,dispatch,project; outcome ok/failed/skipped/degraded; provider, http_status, error_code, message ≤ 300 redacted).
- `rubric_step_marks` (step ∈ **plan, health, purge**; seeded rows).
- `rubric_breakers` (scope provider/rubric, failures_json ≤ 6, opened_until).
- `rubric_notices` (key ≤ 160, msk_day, kind failure/health/bank/summary).
- `rubric_once_keys (rubric_key, once_key, slot_id, created_at, PRIMARY KEY (rubric_key, once_key)) WITHOUT ROWID` — inserted in the guarded building→ready batch (H3), deleted on yield/empty/cancel/supersede/missed; kept for sent/partial/unresolved/unknown.
- `rubric_overrides (rubric_key, entry_key, kind CHECK IN ('recheck'), reason ≤ 200, created_at, cleared_at, PRIMARY KEY (rubric_key, entry_key, kind)) WITHOUT ROWID` (14, stage 6).
- `rubric_budget_days (day TEXT UTC, resource CHECK IN ('browser_ms','screenshots'), used, cap, PRIMARY KEY (day, resource))`; `rubric_leases (name PK, until)` seeded `browser`.
Design: no FK to posts/publications (lifecycle purges posts); every `ON CONFLICT(col)` repeats the partial WHERE or omits the target (N11); slot inserts `INSERT … ON CONFLICT DO NOTHING` without target (B1); replacement inserts `INSERT … SELECT … WHERE NOT EXISTS (old id live)` (N6).

**0120 `rubric_bets`** (stage 5): `rubric_bets (id TEXT PK, bet_slot_id TEXT NOT NULL UNIQUE, singleton INTEGER NOT NULL DEFAULT 1 CHECK (singleton = 1), patch_at_bet TEXT NOT NULL, hero_ids_json, look TEXT, form CHECK IN ('picture','text'), poll_id TEXT, opened_at INTEGER NOT NULL, claimed_at INTEGER, resolve_kind CHECK IN ('patch','timeout') NULL, resolve_patch TEXT, final_votes_json, result_slot_id TEXT, closed_at INTEGER)`; `CREATE UNIQUE INDEX rubric_bets_open_uq ON rubric_bets (singleton) WHERE closed_at IS NULL`. Row inserted in the bet slot's building→ready batch (a second open bet violates the index ⇒ that build fails `BET_OPEN`, no post); deleted if the bet slot ends unsent; claim `UPDATE … SET claimed_at=? … WHERE closed_at IS NULL AND claimed_at IS NULL` (changes = 1); `closed_at` set in the projection batch of the result slot's `sent`.

**0121 `rubric_analytics`** (stage 7): `tg_post_audience`, `rubric_post_scores` (+ 2 indexes; REAL NOT NULL rejects NaN), `rubric_summary_runs`, `rubric_comment_themes`, `rubric_week_blocks`. DDL: `area-backend-analytics.md` §5.2.

**0122 `rubric_learning`** (stage 8): analytics `rubric_learning_state` (singleton), `rubric_learning_log` (UNIQUE week_key, kind, subject) — `area-backend-analytics.md` §5.3 — plus scheduler-owned `rubric_hour_slots (grp TEXT CHECK IN ('wd','we','mon','tue','wed','thu','fri','sat','sun'), slot_index INTEGER CHECK IN (0,1), minute_of_day INTEGER CHECK BETWEEN 480 AND 1350, default_minute INTEGER NOT NULL, source CHECK IN ('default','learned','manual'), revision, changed_at, PRIMARY KEY (grp, slot_index)) WITHOUT ROWID` seeded wd/we × {750, 1140}.

**0125 `drop_content_rubrics`** (stage 9, contract phase; 0123 went to the stage 10 journal, 0124 to the slots time index): drops `content_post_rubrics`, `content_rubrics` (0089) only after prod runs the release without the code (d1-migration rule 9); `content_items.tags` stays unless proven unused.

Deploy-without-migration behaviour: 0117 missing ⇒ shim keeps publishing, scheduler `SCHEMA_BEHIND`; 0118 missing ⇒ audience branch swallows «no such table», owner commands unaffected; 0119+ missing ⇒ scheduler off this tick, endpoints 503 `MIGRATION_PENDING`; 0121/0122 missing ⇒ analytics steps skip, endpoints 503.

---

## 5. Slot state machine (every live state has `next_action_at` and a `deadline_at` exit; generated table test proves each exit is reachable)

| State | Entered | Action at `next_action_at` | Success | Deadline / other exits |
|---|---|---|---|---|
| planned | plan insert; fallback retry/advance | at `build_at` (slot − 3 h; chain/event: now): guarded claim → building, `attempt+1`, lease 15 min, `AI_JOBS.send` id `uuid(sha256('rubric-build:'+slot+':'+attempt))` | building | slot − 20 min ⇒ `empty NOT_BUILT_IN_TIME`; plan supersede (WHERE status='planned') ⇒ `superseded`; lock-off ⇒ `cancelled`; frozen within 10 min of `build_at` (M2) |
| building | claim | `min(lease_until, deadline)` | ready | slot + 2 min ⇒ `empty`; lease lost after `build_started_at` ⇒ `BUILD_LOST` ⇒ next candidate; before start ⇒ same candidate once; 2 BUILD_LOST/24 h ⇒ rubric breaker 24 h (H5); content skip ⇒ `skipped`; lock-off ⇒ `cancelled` (media/post deleted) |
| ready | guarded building→ready (+ once keys, bet row, then post create/attach) | slot − 60 s: release gate | released | slot + 4 min ⇒ `missed RELEASE_LATE`; gate violation ⇒ `yielded` + dirty; patch changed ⇒ `superseded` + dirty (H2); **before every exit: N1 lookup by post ⇒ found ⇒ `released`** |
| released | publication created (`scheduledAt = slot_at`, `not_after = slot + 20 min`, key `rubric:<slot>`) | slot + 2 min, then every 5 min: project | sent · partial · unknown · send_failed · missed | slot + 24 h ⇒ `unresolved`; handler errors ×3 (backoff 2ⁿ min) ⇒ `unresolved` |
| unknown | projection sees job `unknown` | hourly re-projection | sent / missed after owner reconciliation in «Публикации» | created + 72 h ⇒ `unresolved` + one notice; counts for caps/rest/hero; holds its follow-up; excluded from re-selection and lease recovery |
| waiting_parent | follow-up at parent's `released` (`slot_at = parent + afterMinutes`, build copied) | parent `sent` ⇒ ready (slot_at collision ⇒ +10 min, ≤ 6 tries) | ready | own slot + 20 min ⇒ `cancelled` + notice, post kept approved in the studio for a manual send |
| poll_close (kind) | projection of a sent poll at `sent_at + 24 h / 168 h` | `stopPoll` | `sent` with final counts in `facts_json` (+ `recordFinalPoll` if 0118) | slot + 24 h ⇒ `missed` + notice; `already_closed` ⇒ counts from `tg_polls` or empty; `not_found` ⇒ `missed`; 429/unknown ⇒ backoff retry |

Terminal: `sent partial unresolved send_failed missed empty skipped yielded cancelled superseded`. `send_failed` only from a definite `rejected`. Counting (rest, caps, hero, families): `sent partial unresolved unknown` + pending occupants `ready released`; not counting: `send_failed missed empty skipped yielded cancelled superseded` (rest not consumed; owner «failed rubric keeps its turn»). Projection mapping: publication `sent`⇒sent; `failed` (definite)⇒send_failed; `unknown`⇒unknown; `cancelled`/missing⇒missed (`NOT_AFTER_PASSED`/`OWNER_CANCELLED`); series first sent + later cancelled ⇒ partial; `scheduled_at ≠ slot_at` ⇒ `manual=1` (N4: reschedule clears `not_after`). Release error classification: `area-backend-core.md` §10 table (replay ⇒ released; `SCHEDULE_OUT_OF_RANGE` ⇒ missed; post gone/`CONTENT_INVALID`/`ALREADY_PUBLISHED`/`IDEMPOTENCY_KEY_REUSED`/`POST_ARCHIVED` ⇒ missed + notice after N1; destination errors ⇒ missed + lock; `IN_FLIGHT`/`UNAVAILABLE`/D1 ⇒ stay ready +30 s). Dedupe: an event key with ≥ 2 ended slots in empty/missed/send_failed is dropped with one notice (B2).

Fallback (pure `fallback.ts`): transient (5xx/timeout/429) with ≥ 45 min left and not yet retried ⇒ same candidate once after 10 min; allowed degradation ⇒ text variant if alternation allows; else next of ≤ 3 candidates (same weight → other weight → greeting filler) ⇒ else `empty`; late same-day fill only if invariants hold. Provider breaker: 3 failures/6 h ⇒ dependents out 6 h (one notice), probe after expiry. Failed rubric gets +1.0 rank for 48 h when its breakers are closed. Content skip (`NO_DATA`, `SkipReason`) ⇒ `skipped`, `skip_until` = next MSK day, no notice. Start-up (owner mechanism): pool rubrics get a seeded `last_sent_at` spread over their rest window (`POOL_PER_WEEK = 10`, `last_sent_seeded = 1`, never used by analytics); event/calendar rubrics wait for their trigger; an enabled or resumed rubric gets `last_sent_at = now − rest` (`area-backend-core.md` §13). Error taxonomy: `area-backend-core.md` §12 + rubrics codes `TOO_SIMILAR`, `FACT_CHECK_FAILED`, `SCENE_FAILED`, `ICON_MISSING`, `NOT_ENOUGH_GAMES`, `BET_OPEN`, `AI_TEXT_FAILED`.

---

## 6. Cron / Queue flow and budgets

### 6.1 Tick (`app/scheduled.ts`, every minute on DEV and prod)
1. Existing steps unchanged up to `notifyOwnerOfDeliveries` and `publicationIdle`.
2. `step('rubric-scheduler', runSchedulerTick)` — own container over `meterD1(env.DB, 40)` (F11); not gated by `publicationIdle`, `counts.due`, minute or other steps' failures (B4); its failures never feed other gates. Order inside: locks (env locks cost 0 statements; then 1 settings read) → off-cleanup once (≤ 20 posts/tick) → slot step every tick incl. :00/:30 (live rows with `next_action_at ≤ now`, ready branch LIMIT 3 + others LIMIT 3, each in try/catch: release ≤ 2, claim ≤ 2, project ≤ 4, poll-close, deadline exits; stop when `remaining() < 8`) → one marker step (`plan` 30 min or dirty, `health` 15 min, `purge` daily; failure backs off `min(2^n, 30)` min, order rotates, N5).
3. `plan` ≈ 10 reads + 1 guarded batch ≤ 28 statements; today+tomorrow MSK; conflicts logged `plan_conflict`, dirty, never thrown.
4. Analytics block (stage 2/7/8, after owner alerts, own claims via `claimStepWindow`): minutes 22 `ra:score`, 37 `ra:purge`, 7 (MSK 06) `ra:summary`, 47 (Mon) `ra:week`, 52 (Mon) `ra:learn`, 12 (MSK 12) `ra:health`; 0 statements on other minutes, ≤ 2 on them; enqueue only if `remaining() ≥ 2 + HEARTBEAT_RESERVE`.
5. `dota-enqueue` and the rest unchanged; `process-dota-updates` marks `plan` dirty on a new patch and claims the 06 bet (stage 5).

### 6.2 Queue (`content-ai-*`, batch 1, `max_retries 0`; consumer always acks)
- `rubric_build {id, slotId, attempt}` (no `chatId`, never in `lostJobs`): runs in every build (not behind `lab`); claim id (INSERT OR IGNORE), slot must be building/same attempt/lease valid, guarded `build_started_at`, eligibility, history, `buildRubricPost(strict)`, similarity (stage 5), media to R2 `rubric/<slot>/<attempt>/<n>`, guarded → ready + once keys + bet row, deterministic post id (`uuid v8 sha256('rubric-post:'+slot+':'+attempt)`, N8), attach `WHERE post_id IS NULL AND status='ready' AND attempt=?`; every failure path deletes what it created; purge removes `RUBRIC_ACTOR` approved posts with no slot after 1 day (≤ 20/day). Meter `meterD1(DB, 200)`.
- `rubric_analytics {id, step}`: score, purge, summary, week, learn, health; meter 200; 15 min wall time.
- `rubric_sample` (lab) unchanged.

### 6.3 Budgets
| Resource | Limit | Mechanism |
|---|---|---|
| D1 statements, tick | scheduler 40 (own meter), analytics ≤ 2, others' 50 untouched | test «worst busy tick ≤ 40»; over-budget step defers, never half-applies. Re-read current Paid subrequest limit at stage 4 and fix `platform/d1-budget.ts` comment (N11) |
| Posts | ≤ 3/day incl. news (picture+poll = 1); rubrics ≤ 2 (≤ 3 with an anchor, total cap still 3); ≥ 2 h apart (follow-ups exempt); interactive ≤ 1/day, ≤ 4/7 d, ≥ 40 h; heavy day (≥ 3 news/24 h) ⇒ one rubric slot, L only | `constraints.ts` + final gate |
| Browser Rendering | prod `BROWSER_DAILY_CAP_MS=720000`, DEV 240000, UTC day; pacing lease `browser_next_at` (start 2 s on Paid; verify REST limits) | `rubric_budget_days` conditional reserve, settle actual; cap ⇒ `browser` leaves capabilities for the day, no notices, UI «лимит браузера». Verify price page before stage P (`not_run` until then): 16 min/day ≈ 8 h/month < included hours |
| STRATZ | one request at a time, `STRATZ_GAP_MS` (1200, stratz-api.ts), lease in STATS_DB with the collector; rehearsal never calls STRATZ | memory «rubric data no rush» |
| OpenAI | existing AI budget gate (AI cap owner-controlled); rehearsal 0 calls; trials per `docs/ai/README.md` «Trials», cost + cap stated before running | |
| Comment themes | ≤ 1 AI call/day, ≤ 120 comments, ≤ 30 KB in, ≤ 1500 tokens out, skip < 8 | `rubric_summary_runs` claim |
| Notices | 1 per rubric+step+code per MSK day; ≤ 6 failure notices/day + one summary after 20:00; bank/breaker/unresolved/schema kinds exempt from cap (still deduped) | `rubric_notices` |
| Workers AI (6b) | 10 k neurons/day included; cap in code | stage 6b |
| Bundle | Paid 10 MB compressed; gate at stage 0: > 7 MB ⇒ fake-item icons (4.28 MB source) to R2 (owner uploads) | dry-run size |
| CPU | queue consumer default 30 s; measure builds on DEV; > 20 s ⇒ `limits.cpu_ms` | stage 0 |

---

## 7. Per-rubric table (31 rows; detail, facts, rule code, tests in `area-backend-rubrics.md` §3–4)

V = picture post, L = text/bare poll. «Prod from» = stage after which the rubric is eligible on prod (inner rules ready + needs met). Rehearsal = DEV candidate (capabilities {browser}).

| # | key · title | Trigger | V/L | Int | Needs (prod) | Rest d | Hour (MSK) | Bank end | Poll close | Reh. | Prod from | Annex |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 01 | patch_broken «Кого понерфили» | chain D0 (hero changes) | V | – | browser, ai_text | – | day; evening if a patch card took the morning | – | – | – | 5 | rubrics §3·01 |
| 02 | who_is_imba «Кто теперь имба?» | chain D1 evening, even if 01 skipped (≥ 2 stronger) | V+poll | ✓ | browser, ai_text | – | evening | – | 24 h | – | 5 | §3·02 |
| 03 | nerf_or_buff «Нерф или баф?» | chain D3, ≥ 40 h after 02's poll | V poll w/ picture | ✓ | browser | – | day | – | 24 h; trap quiz 168 h | if trigger | 5 | §3·03 |
| 04 | whose_ability «Чья способность?» | pool; answer +180 min (hint Q9) | V+V | ✓ | browser | 14 | day, riddle ≤ 15:30 | – | – | ✓ plain answer | P (first guess 5) | §3·04 |
| 05 | files_dont_lie «Утечка недели» | Friday, finds ≤ 7 d not shown | V | – | browser, ai_text | 7 | Fri evening | – | – | – | 6 | §3·05 |
| 06 | who_gets_nerfed «Кого понерфят?» | bet ≥ 21 d after patch, one open; result D2 of next patch after 01; 60 d timeout | V+poll; result same form | ✓ | browser, ai_text, stratz | – | weekday day; result day | – | 168 h | – | 5 | §3·06 |
| 07 | valve_seriously «Valve, ты серьёзно?» | chain D5 (D4–D6) | V or L (text in patch week) | ✓ | ai_text (+browser for picture) | – | evening | – | 24 h | – | 5 | §3·07 |
| 08 | valve_time «Валв-тайм» | marks 30/45/60/90/+30 d without a patch | V | – | browser, ai_text | – | day; ≤ 2 d earlier, never later | – | – | – | 5 | §3·08 |
| 09 | rate_it «Оцениваем» | Valve announcement ≤ 21 d, 1–5 d after our news post | V photo+poll | ✓ | ai_text, ai_upscale | ≥ 7 between | evening | – | 24 h | – | 6 | §3·09 |
| 10 | who_beats_whom «Кто кого перебьёт?» | pool; real/joke strictly in turn | V | – | browser (+stratz real) | 21 | evening | – | – | joke only | P | §4·10 |
| 11 | workshop_set «Сеты из мастерской» | pool; a set never repeats | V album | – | ai_text, ai_upscale | 21 | any | – | – | – | 6 | §4·11 |
| 12 | hero_guide «Гайд на героя» | pool; hero rounds, second role ≥ 150 games & ≥ 15 % | V carousel | – | browser, ai_text, stratz, stats_db | 9 | Sat/Sun preferred | silent round | – | – | 6 | §4·12 |
| 13 | confess «Признавайтесь» | pool; bank/AI in turn, confession 2 of 3 | L | – | – (AI turn ai_text) | 14 | any | new round + text | – | bank only | 6 | §4·13 |
| 14 | explain_dumb «Объясни как дебилу» | pool; bank/AI, «теперь так» | L | – | – (AI turn ai_text) | 21 | any | new round + text | – | bank only | 6 | §4·14 |
| 15 | toxic_translator «Переводчик с токсичного» | pool | L | – | – | 14 | evening | new round + text | – | ✓ | 4 | §4·15 |
| 16 | ability_in_life «Способность в жизнь» | pool | L poll | ✓ | – | 14 | day | new round + text | 24 h, joke last | ✓ | 4 | §4·16 |
| 17 | hero_profile «Анкета» | pool; heroes once per round | V AI scene | – | browser, ai_image | 21 | Fri/Sat evening | silent round | – | – | P | §4·17 |
| 18 | item_leaflet «Инструкция по применению» | pool | L | – | – | 21 | any | new round + text | – | ✓ | 4 | §4·18 |
| 19 | tier_list «Тир-лист» | pool; six looks in turn | V | – | browser, stratz | 30 | any | – | – | – | P | §4·19 |
| 20 | recruit_picks «Что брать рекруту» | pool; AI + fact check, top ten rounds | V | – | browser, ai_text, stratz | 30 | 18:00–19:00 | silent round | – | – | 6 | §4·20 |
| 21 | forgotten_hero «Забытый герой» | pool; rounds, still rare at posting | V AI scene | – | browser, ai_image, ai_text, stratz | 30 | any | silent round | – | – | 6 | §4·21 |
| 22 | horoscope «Гороскоп» | anchor Monday 08:00 every 2nd week | V AI scene | – | browser, ai_image | anchor | 08:00 exact | forms: text; tellers: silent | – | – | P | §4·22 |
| 23 | hero_trial «Подозреваемый» | pool; 127 heroes once per round | V AI scene+poll | ✓ | browser, ai_image | 21 | evening | silent round | 24 h | – | P | §4·23 |
| 24 | would_you_rather «Что выберешь?» | pool | L poll | ✓ | – | 14 | any | new round + text | 24 h | ✓ | 4 | §4·24 |
| 25 | on_lane «Ты на линии» | pool; live Valve numbers, ≤ 3 tries | L quiz | ✓ | – | 14 | any | **pause** + text | 168 h | ✓ | 4 | §4·25 |
| 26 | rebus «Ребус» | pool | V quiz in picture | ✓ | browser | 30 | weekend | **pause** + text | 168 h | ✓ | P | §4·26 |
| 27 | toxic_bingo «Токсик-бинго» | pool; bingo/tier in turn | V | – | browser | 21 | Fri/Sat evening | new round + text | – | ✓ | P | §4·27 |
| 28 | fake_item «Предмет, которого нет» | pool; 40 items | V | – | browser | 21 | any | new round + text | – | ✓ | P | §4·28 |
| 29 | shame_of_day «Пидорок дня» | pool at exact 08:00; MSK yesterday | V | – | browser, stats_db | 7 | 08:00 exact, never a horoscope Monday | – | – | – | P | §4·29 |
| 30 | quote_of_day «Цитата дня» | pool; 300 quotes | L | – | – | 7 | any | new round + text | – | ✓ | 4 | §4·30 |
| 31 | greeting_card «Открытка» | calendar date + card hour; weekday/any fillers; patch card for 7.xx | V | – | browser | 30 (fillers) | card's own hour | fillers: new round + text | – | approved cards | 5 | §4·31 |

Shared rubric layer (stage 4 unless noted): `meta.ts` (31 keys incl. `innerRulesReady`, families, `sameDay/sameWeek/apart`, needs, `needsByVariant`, `allowDegrade` — only 07 `PICTURE_DROPPED`, 11 `ALBUM_PHOTO_DROPPED` (≥ 2 photos), 12 `GUIDE_OPTIONAL_BLOCK`), `bank-pick.ts`, `bank-index.generated.ts` + `npm run rubrics:index` (stale-index test), `seeded-random.ts` (`slot:attempt`), `inner-rules.ts`, `topics.ts`, `valve-values.ts`, `first-guess.ts` (5), `patch-chain.ts` (5), `similarity.ts` (5), `bet.ts` (5), `calendar-rules.ts` + `greeting-card(s).ts` (5), `find-identity.ts`, `workshop-pick.ts` (6). Code conflicts C1–C22 and their fixes: `area-backend-rubrics.md` §6 (all adopted). Defaults where docs are silent (A1–A6: vote line ≥ 10 votes; 21 mirror every 4th; 25 pause; 15↔27 window 60 d; 29 stalled day < max(100, 0.5 × 6-day median); two cards one date ⇒ big holiday) are coded as constants, shown to the owner in §13.

---

## 8. Analytics and learning (stages 2, 7, 8; detail `area-backend-analytics.md`)

- **Capture (stage 2).** Audience branch = second grammY middleware, before `ownerOnly` (create-bot.ts:252): only `message_reaction_count`, `poll`, group/supergroup `message`; foreign chats and unregistered polls write nothing; never replies, never throws; private chats `next()` untouched. `allowed_updates` += `poll`, `message_reaction_count`; owner re-connects. Comments: auto-forward ⇒ thread; reply ⇒ comment (HMAC author key with `AUDIENCE_HASH_KEY`, username if any, sanitised text ≤ 500, cap 500/thread, ingest only posts ≤ 10 d). Setup check (`getChat`, `getChatMember`) at connect and daily; states not_checked/ok/bot_not_admin_in_channel/no_linked_group/bot_blind_in_group/no_key/silent on `/bot/status`. Polls registered by the scheduler projection (`registerPoll`).
- **Score (stage 7).** One row per sent rubric post at age ≥ 25.5 h, frozen at 24 h (views, reactions, comments, votes), late fill at 73.5 h; baseline = channel posts `[t−28 d, t)` same age, min 5; components smoothed (+1), clamped [0.1, 10], composite = weighted log mean (0.5/0.2/0.2/0.1), finite guards; DEV/test-channel posts skipped.
- **Comparisons.** Between rubrics (7/30/90 d, ≥ 3 scored = enough, best/worst need ≥ 2 rubrics, reason = biggest component); inside a rubric (× to the rubric's own median, slices hero/line/look/picture/hour/weekday, `few` < 3); hours heat 7 × 16 (08–23 MSK).
- **Comment themes.** ≤ 1 AI call/day, comments as JSON data in a delimited block, model returns ids + enum kinds + ≤ 3 labels; counts and quotes by code; labels never enter any prompt; DEV skips (no AI).
- **Weekly report block «Рубрики»** (owner decision): built Monday from 06:47 MSK into `rubric_week_blocks` (window by `scored_at`), read by one PK statement in the report; contents = ranked rubrics vs usual post, best/worst rubric with reason, best/worst post, rest changes (advised/applied), slot failures/skips in one line; existing video line renamed «🎬 Форматы видео» (Q12). Review facts get numbers and enum tallies only.
- **Learning (stage 8).** Advise 28 d from the first score, then apply unless switched off (Q10): rest ±10 % (1–5 d), bounds 7–60, dead zone 0.85–1.15, ≤ 3 changes/week, 14 d cool-down, shrinkage to the channel mean, pool rubrics only, never `manual`; hours per group wd/we (single weekday once ≥ 12 posts), ±60 min steps, ≤ ±3 h, starts 08:00–22:30, gain ≥ ln 1.10, rubric-relative score; the scheduler applies through `RestSettings.apply` / `HourPlan.apply` and re-checks its invariants. Exploration posts (1 in 5 from stage 4) feed the cells.
- **AI writer.** Only via weekly facts → hypotheses → owner «Учитывать» → `ai_rules`; rubric captions get owner + approved rules (`rules` input, Q11); scores, quotes, labels, comment text and usernames never reach a prompt (test).
- **Semantic similarity (6b).** Workers AI `@cf/baai/bge-m3` after 4 weeks of lexical data (owner); threshold tuned on labelled pairs from the lexical log; trial first.

---

## 9. UI per screen (detail and full state matrices: `area-frontend.md` §5–6, `area-design.md` §3–5; mocks `ui-mock/*` layout only)

### 9.1 Navigation and routes
`NAV_ITEMS`: «Рубрики» after «Публикации», icon `list`, `primary:false` (phone: «Ещё»). Routes `/rubrics` (`?tab=list|compare|comments`, Календарь default; `?view=list` (Месяц default), `?day`, `?q`, `?state`, `?mode`, `?period`, `?rubric`, all Zod with `.catch`) and `/rubrics/$key` (Telegram BackButton child). Titles «Рубрики — ALEXEEV Studio». Section shows «время МСК» once in the header; never `useOwnerTimezone()`.

### 9.2 Screens by F-stage
| F | Backend stage | Screen work | States that must exist |
|---|---|---|---|
| F1 | 3 | `/rubrics` shell, Календарь forecast-only (Месяц + Список, agenda, legend), Banner «Автопубликация ещё не включена — это прогноз»; manual «Рубрики Telegram» removed (§11 stage 3) | loading, empty, error+requestId, 401, 403, forecast-only |
| F2 | 4 (+P) | `SchedulerSwitch` (on/off ConfirmDialogs, locks as Banners, DEV unavailable, rehearsal banner, saving `isPending`, transition polling, error, 409, 503, stale plan); live Календарь (all slot states, notes with step/provider/HTTP/code, «Подробности», replacement/moved/skip flags, «Что поменялось», `unknown` text «Telegram мог принять пост — проверьте канал. Повторной отправки не будет.» + «Сверить в Публикациях», no retry/cancel); tab Рубрики (search, filters incl. «Нужно внимание», statuses incl. «Банк исчерпан», «Нужен Browser Rendering», «Нужен ИИ · на DEV репетиция без ИИ», «Нужен STRATZ», «Нужна база матчей», breaker «Сбой, пауза до …»); card base (header switch with pause ConfirmDialog, key facts, bank block, banners, «Последние выходы»); `browserBudget` line «Картинки сегодня: N из 12»; slot detail (`slots/{id}`) as `Disclosure`/drawer; `/lab`: titles from contracts, one intro sentence, `BackgroundJobsPanel` row `rubricScheduler` | + 409 conflict banner (no silent replay), saving, transition, unknown, locked, rehearsal |
| F3 | 5 | event/anchor/chain chips (`ReasonChip` accent + icon), `greeting_card` in lists, card `bet` block (06, read-only) | – |
| F4 | 6 | card «Внутренние правила» (progress «74 из 126 героев», «Заблокировано N за месяц»), 14 recheck list with «Проверено» button (Q8) | 409 on clear |
| F5 | 7 | tabs Сравнение (Между рубриками: `RatioBar` ranking, «Мало данных» group, hours heat; Внутри рубрики: rubric Select, 4 StatTiles, `ComparisonRow` list, `SliceCard`s) and Комментарии (not_connected/no_data/limited/ready; quotes as plain text; retention line from DTO only); list column «К обычному»; card blocks | few, empty «Охват появится через сутки после выхода поста» |
| F6 | 8 | card «Часы» (выучено/вручную/по умолчанию), «История отдыха», advice line; heat `peak`/`trial` | – |

### 9.3 Slot badge table (single source `shared/ui/status-meta.ts`; `ru.status`)
forecast «Прогноз» muted dashed · planned «Запланировано» pending · building «Собирается» active (static under reduced motion) · ready «Готово к выходу» pending · released «Публикуется» active · waiting_parent «Ждёт предыдущий пост» pending · sent «Опубликовано» done (only with `externalMessageId`, else «Требует проверки») · partial «Вышло частично» unknown · unknown «Требует проверки» unknown · unresolved «Не сверено» unknown · send_failed «Ошибка отправки» failed · missed «Не вышло в срок» failed · empty «Не собран» failed · skipped «Пропуск» muted · yielded «Уступил» muted · cancelled «Отменено» muted · superseded «Заменён» muted (icon `swap`). Rubric keys: «Активна», «На паузе», «Ждёт события» (pending), «Банк исчерпан» (unknown), «Нужен …» (muted).

### 9.4 Design system (owner agent: design-system)
New tokens `--color-heat-0..4` only. New primitives `MonthCalendar` (RAC Calendar, 5 weeks Monday-first, spike first, fallback roving grid), `AgendaList/AgendaRow` + `ReasonChip` (container-query reflow 560 px), `RatioBar/RatioValue`, `HeatGrid` (transposed < 560 px, `role="grid"`, table alternative), `SliceCard`, `ComparisonRow/List`; extensions: `status-meta` keys, `Switch.isPending`, `DataTable.cardsBelow` (measured threshold), `Icon` `swap`/`star`; no text opacity, no `--color-text-disabled` for information; permanent guards: `npm run overlap:check` (320–1920, dark/light, reduced motion, ellipsis audit, vertical clip, target size, focus-not-obscured) and `rubrics-contrast.test.mjs` (8 presets × 2 themes) in `npm run test`. Catalog `/__catalog` per Q15.

### 9.5 Frontend rules
Server is the only truth (no optimistic switch/pause; sent only with proof); polling: calendar 30 s with a live slot / 5 min otherwise / 5 s during transition, status 30 s, forecast none, no polling in a hidden tab; batched polite announcer; text from the server rendered as text; links built from ids only; slice `features/rubrics/` structure as `area-frontend.md` §7.

---

## 10. Test plan by layer (skill `testing`: real D1 migrations, fake clock, scripted Telegram/AI; assert D1 state, not mock calls)

**L1 pure tables (backend).** `msk-time` (20:59/21:00 UTC, 31.12→01.01, 29.02); `triggers` (hotfix joins chain ≤ 5 d, 02 after skipped 01, 03 ≥ 40 h, 07 window, 08 marks + reset by any patch, 09 1–5 d / never same day / newest first / ≥ 7 d, 05 Friday, 06 ≥ 21 d + one open, 22 parity, 29 not on horoscope Monday, 31 dates incl. Easter 2026/2027, maslenitsa, last-sun-08, black-friday 2026-11-27, day-256 leap, `year % 4` 14.02, patch 7.xx only); `constraints` one rule per row (≤ 3/day incl. news, picture+poll = 1, ≥ 2 h, 08–23, interactive 1/4/40 h, families, hero 72 h with 06 result exempt, V/L alternation over all posts, quiet week after hero patch, heavy day, unknown counts, virtual follow-up occupies); `exclusions-from-meta` pinned to every doc pair + symmetry; `plan` (B1 pool+event same `slot_at`, freeze within 10 min, supersede never UPDATE slot_at, conflicts returned, exploration ≈ 1/5 inside invariants); `select` (ratio, failed boost only with closed breakers, alternates order); `seeding` spread; `slot-machine` generated «every live state has a reachable deadline exit»; `release-classify` table; `fallback`; `breakers`; `notice-policy` (keys, cap 6, summary text, exact bank texts); `capabilities` (rehearsal ⇒ openai/stratz false; DEV no statsDb); lock var `"on"` only (`"true"`, `"ON"`, missing ⇒ off); rubrics: `meta.test` (31 keys = contracts enum, rest 7–60, symmetry, families, allowDegrade), `bank-pick` (round, used incl. live, new-first after growth, accept skip stays unused, pause vs new round, seed determinism, lost build consumes nothing), `inner-rules` (alternations 10/13/15/16/19/27/29, 04 difficulty, joke windows 02/03/07/08/09, topic windows 13/24/30/14↔18/25, look-not-twice), `patch-chain`, `bet` (≥ 2 new heroes, vote line ≥ 10, timeout text), `find-identity`, `first-guess` («Котла», «котл», «крест», «аба» vs «абажур», two-letter aliases ignored, ≥ 3 heroes = spam, negation counts), `workshop-pick`, `calendar-rules`, `similarity` (+ bank calibration p99.5 below thresholds), `topics` (every entry tagged, «иммунитет к магии»↔«БКБ»), `shame-of-day` MSK window, data tests (`suspect-data`, `fake-item-data`, bank keys unique, `bank-index-fresh`, 15↔27 overlap report); analytics: `stats` (NaN, ±Inf, 0, empty), `score`, `aggregate/slices`, `rest-advice` (0.85/1.15 edges, 7 d → 1, 60 d → 5, cool-down 13/14, manual skipped, ≤ 3), `hour-advice` (n 2/3, group 11/12, ln 1.10 edge, ±60, ±3 h, 22:30), `sanitize`, `theme-validate`, `week-block`.

**L2 property (fast-check, devDependency).** 200 seeds over final times: ≤ 3/day, ≥ 2 h, 08–23, interactive, families, hero 72 h, V/L, anchor exact minute, rest bounds, no two slots on one time.

**L3 simulation.** Stage 3: 10 seeds × 30 days (no rubric starves beyond max(2·rest, 60) d; invariants). Stage 8: 20 seeds × 365 days with learning.

**L4 Worker integration.**
- Publishing (stage 1): `two ticks race a job with not_after → one send`; `claim refuses expired`; `reconcile cancels expired pending/retry_wait with kill switch off, never claimed/unknown`; `series child behind unknown parent cancelled at not_after`; `429 retry_after beyond not_after → cancelled`; `reschedule clears not_after`; `gapMs 30 s spacing, rejected over HTTP`; `pictureInPoll sends media; media without flag → CONTENT_INVALID`; `poll.id stored; missing poll.id stays sent`; `stopPoll closed/already_closed/not_found/429/unknown`; `deploy without 0117 → shim sends, one log, scheduler SCHEMA_BEHIND`; PublicationStatus mapping unchanged.
- Scheduler (stage 4): plan `off→on restores slots`, `yield re-plans`, `re-plan vs claim race`, `conflict never throws`, `slot_at unique across kinds`; markers `archive step throws every tick → slots still planned/built/released`, `due>0 every tick`, `missed window next tick`, `failing marker backs off, health/purge still run`; build `two claims → one message`, `lease expiry before/after start`, `stale message`, `lock-off mid-build deletes media/post`, `crash between ready and post attach`, `no BROWSER → not candidates, 0 notices`, `strict degradation fails candidate`, `content skip → skipped, no notice`, `failed build leaves bank entry/hero unused`; release `two ticks → one publication`, `crash between create and released repaired by N1`, `Cron down until +5 min (N1)`, `late > 4 min → missed`, `post deleted / CONTENT_INVALID / KEY_REUSED / POST_ARCHIVED`, `two releases < 2 h in one tick`, `stale channel data fails open`, `patch between build and release → superseded`, `same hero two builds → second yields` (stage 5: once keys); dispatch `kill switch past not_after`, `429 beyond not_after`; projection `sent/partial/unknown/cancelled`, `manual`, `follow-up created once`, `poll_close created once`, `unknown → 72 h unresolved + 1 notice`; notices `10 failures → 1 notice + summary`, `bank exhaustion exact texts once per round`, `pause resumes after bank growth`; budget `worst busy tick ≤ 40`; deploy without 0119 → off + 503; rehearsal `allowlist refuses prod chat at release and in dispatch`, `zero AI calls`, `zero rows when var off`; ledger `concurrent reserves never exceed cap`, `UTC day roll`, `lease serialises two consumers`.
- Stage 5: `bet race → one open (partial UNIQUE)`, `resolution once`, `2-month timeout result`, `bet closes only when result sent`, `patch chain with hotfix`, `anchor exact minute`, `greeting date/hour`, `04 answer waits for parent; parent unknown holds answer`, `first guess / plain answer without audience`, `once keys reserved at ready, released on yield`.
- Stage 6: `two builds one hero via once keys`, `similarity reject → rewrite → bank line / next candidate`, `fact-check fail → candidate fails`, `14 recheck blocks entry until cleared`.
- Audience (stage 2): `foreign-chat flood → 0 rows in every tg_* table and webhook_updates`, `reaction replay one row, older date ignored`, `unknown poll id no write`, `closed poll not reopened`, `recordFinalPoll wins`, `auto-forward thread + comment once on replay`, `owner/bot/sender_chat excluded`, `thread from reply_to_message when forward missed`, `500 cap`, `post older than 10 d dropped`, `no AUDIENCE_HASH_KEY → comments off`, `no raw user id in any table`, `owner /start and /status answered when audience repo throws and when tg_* tables missing`, `stranger private message unanswered`, `/status in the group gets no reply`, `setWebhook carries four kinds`; setup check matrix; retention `purge past 10 d in bounded batches, freeze before purge`.
- Analytics (stage 7/8): `rubric-score` (once across two runs, pending, other channel, v24h null, late fill, window, poll alive rule, missing tables), `comment-themes` (hostile comments only inside JSON block, hostile model output validated, two deliveries → one call, < 8 skipped, AI unavailable → failed, `__LAB__` no call, no username in prompt), `week-block` (windows chain, one per week, report with/without block, rename), `learning` (advise only 28 d, apply via fake port, replay → one row, conflict/manual/out_of_range, apply off), `ai-boundary`, `cron-rubric-analytics` (0 statements off-minute, ≤ 2 on).
- Migrations: each applies on empty D1; EXPLAIN QUERY PLAN for due scan, expiry, slot due, history, once keys, purge, score window, thread lookup; CHECKs reject NaN-as-NULL, out-of-range rest.

**L5 webhook** — part of the audience list above (owner flow byte-identical when branch off/broken).

**L6 contracts** (`tests/integration/rubric-scheduler-contract.test.ts`, `tests/contract/rubric-analytics.test.ts`): every endpoint success + each documented error parses; `RUBRIC_ACTOR`/`OWNER_PREAPPROVED` not reachable via HTTP; `gapMs`, `pictureInPoll`, `shuffleOptions` rejected by HTTP input; manual rubric routes 404 after removal.

**L7 frontend unit** (`apps/frontend`): `model/msk.test` (21:30Z → next MSK day, Monday grid, clamp, merge rule), `slot-badge.test` (no false success; unknown/unresolved no action), `scheduler-switch.test` (confirm before PUT, pending keeps old value, 500 requestId, unavailable no PUT, locks banners, pause confirm + 409 not replayed), `unknown-slot.test` (no /повтор|отправ|отмен/ button), `rubrics-polling.test` (30 s / 5 min / 5 s, hidden tab, unmount), `slices.test`, `comments-text.test` (markup as text), `rubric-fixtures.test` (fixtures parse with contracts), `error-matrix` rows; design: `StatusBadge` every key, `RatioBar` geometry + «в 1,9 раза», `MonthCalendar` keys and names, `HeatGrid` roving tabindex, `Switch.isPending` focus kept; `rubrics-contrast.test.mjs`.

**L8 browser** (not in `verify`; run by the implementer, reported `not_run` if tooling is missing): Playwright mock scenarios `normal, off, forecast-only, locked-cron, dev-unavailable, rehearsal, unknown-slot, bank-exhausted, capability-missing, breaker, empty, error503, slow` + comments `not_connected, no_data, limited, ready`; `npm run shots` 375/1280/1920 (one contact sheet ≤ 1100 px, ≤ 2 fix rounds); `npm run layout:check`; `npm run overlap:check` (TOTAL issues 0); axe WCAG 2.2 AA 0 violations; keyboard pass; reduced motion; then real-DEV look via `.logs/chrome-dev-profile`, reported separately from mock runs.

Not tested on purpose: pictures, copy, bank wording, CSS look, per-state rendering snapshots, query hooks that only fetch.

---

## 11. Stages (checklists)

Common for every stage: work on `develop` or `feat/…` from it; agents commit with green checks (`npm run verify:changed`; R2/R3: full `npm run verify` + R3 independent review per skill `orchestrate`); commit only the stage's files, conventional message; contract changes in one commit with backend + contract tests + frontend API layer; ask the owner «Пушить?» once the stage is ready (batch pushes: CI minutes are limited from 1.11.2026); the owner pushes `develop` ⇒ CI applies pending migrations to DEV D1 and deploys DEV; agents then verify on DEV themselves (memory: act freely on DEV); for prod the owner applies the stage's migration via Actions → «D1 migrations» → production **before** opening the develop→main PR; agents never touch `main`, `--remote`, secrets or deploys. Report: Russian summary, checks with last output lines, commit hashes, push state, migration number. Docs change in the same commit as behaviour (docs only what exists).

### Stage 0 — extract and harden the build (no migration; R2)
- [x] backend-rubrics: `src/shared/msk-time.ts`; `modules/rubrics/{degradations,facts,meta}.ts` (+ `index.ts` exports), `RubricSample.notes` → coded `RubricNote` in on-lane, stats-rubrics, horoscope; `turns.next(name, bankSize)`.
- [x] backend-core: `app/rubric-build/{sources,build-post,scene,photos,payload,types,ports}.ts` from `app/lab/rubric-samples.ts` L60–673; lab shrinks to build + sends; `pace()` port; `writeRubricCaptionTyped` in `modules/ai/rubric-writer.ts` (+ `index.ts`); `export STRATZ_GAP_MS` in `integrations/stratz/stratz-api.ts`.
- [x] contracts (with frontend): `apps/contracts/src/rubric-keys.ts` (`RUBRIC_KEYS`, `rubricKeySchema`, `RUBRIC_TITLES`); `rubric-samples.ts` uses it; backend `samples.ts` imports it; `features/rubric-samples/ui/RubricSamples.tsx` titles from contracts (one commit).
- [x] tests: `meta.test.ts`, `build-post.test.ts` (strict degradations, `TEXT_TEMPLATE` from typed failure, scheduler ports side-effect free).
- Done: verify green; local-Worker samples of a bank text, a code picture and an AI scene written to a file match pre-change output (owner may press «Прислать» on DEV himself); `wrangler deploy --dry-run --outdir` size before/after recorded (> 7 MB ⇒ icons-to-R2 task before stage 4); DEV Workers Logs CPU per build recorded.
- Prod: no runtime change. Commit `refactor(rubrics): …`; push with stage 1.

### Stage 1 — publishing extensions, migration 0117 (R3)
- [x] Read Bot API changelog (sendPoll `media`, `shuffle_options`, `open_period`/`close_date` limits, `stopPoll`) and record findings in the commit/doc (§2.2 #20).
- [x] backend-core: `migrations/0117_publishing_not_after_poll_id.sql`; publishing application/infrastructure files of `area-backend-core.md` §4.2 (`not_after`, `gapMs`, poll flags, `external_poll_id`, `stopPoll` + `telegram-poll-stopper.ts`, `readPublicationOutcomes`, `findPublicationByPost`, `listRecentPublications`), content `post-media`/`media-library`/`media-ports`/`d1-post-media-repository`, V0 shim in `d1-dispatch-repository.ts`.
- [x] contracts: stored poll schema flags (HTTP input unchanged) + frontend type consumers, one commit.
- [x] docs: `docs/backend/publishing.md`, `docs/backend/data-migrations.md` (prod-migration-before-main release step), `docs/DECISIONS.md` row for that step.
- [x] tests: L4 publishing list.
- Done: full verify; DEV after push: news autopublish still sends (regression), a manual test poll in the test channel closes via a scripted `stopPoll` from the local Worker (not prod).
- Prod: owner applies **0117** first, then develop→main PR. Shim removed in stage 9.

### Stage 2 — audience signals, migration 0118 (R3: webhook; parallel with stage 3)
- [x] backend-analytics: `modules/audience/**` (§15.1 of annex), `app/bot/audience-branch.ts`, `create-bot.ts` (branch before `ownerOnly`), `webhook-route.ts`, `bot-connection.ts` (allowed updates + setup check), `telegram-api.ts` update kinds, `system-state.ts` `claimStepWindow`, `scheduled.ts` `ra:purge`, `ra:health`, `ai-job.ts`/`ai-queue.ts` `rubric_analytics` kind (purge, health steps), `env.ts` `AUDIENCE_HASH_KEY?`, `container.ts`; `migrations/0118_audience_signals.sql`.
- [x] contracts + frontend API: `bot/status` additive `audience`, `webhook.allowedUpdates`; frontend shows it on Settings → Бот (one commit).
- [x] docs: `docs/backend/bot.md` (branch, setup, retention 10 d), `docs/backend/security.md`, `docs/backend/cron.md`, `docs/API_CONTRACTS.md`.
- [x] tests: audience L4/L5 list, setup, retention, deploy without 0118.
- Done: full verify; DEV: bot admin in the test channel and its group ⇒ post → thread row → comment row; reaction and poll rows (agent posts in the test channel only).
- Owner: apply **0118** on prod before main PR; set `AUDIENCE_HASH_KEY` (DEV, prod); make the bot admin of the discussion group (or privacy off); press «Подключить бота» after the deploy.

### Stage 3 — pure scheduler core + forecast + F1 (R2)
- [x] backend-core: `modules/rubric-scheduler/{index.ts, domain/*, application/{ports,plan-preview,read-forecast}.ts}`; `modules/dota/index.ts`, `modules/content-analytics/index.ts` read exports; `app/rubric-routes.ts` (`GET status` forecast_only, `GET forecast`), mount in `create-app.ts`; `container.ts` getters; `package.json` devDependency `fast-check`; `env.ts` `FORECAST_CAPABILITIES` (DEV var).
- [x] contracts: `rubric-scheduler.ts` (status, forecast) + frontend API layer, one commit.
- [ ] design-system D0 (moved to stage 4 with F2, 31.10.2026: the forecast needs none of it; its month grid lives in `features/rubrics`): `status-meta` keys, `Switch.isPending`, `Icon` swap/star, `MonthCalendar` (spike first), `AgendaList/AgendaRow/ReasonChip`, overlap guard files + `overlap:check` script, contrast audit; instruction sentences in `.agents/skills/visual-check/SKILL.md` and `apps/frontend/AGENTS.md` in their own commit + `npm run agents:sync`; catalog per Q15.
- [x] frontend F1: route files, nav item, `features/rubrics/` (msk, merge, slot-badge, forecast Календарь Месяц + Список, legend, forecast banner), `ru` copy; removal of manual rubrics — one cross-area commit with backend (`content-analytics` rubric repo + routes + contracts `contentRubric*` + `tests/integration/content-rubrics.test.ts`) and frontend (`RubricsPanel`, `RubricsSettings`, `PostRubricSelect`, `Rubrics.module.css`, `model/rubrics.ts`, `tests/rubrics.test.tsx`, edits in `content-analytics-api.ts`, `content-analytics-queries.ts`, `index.ts`, `AnalyticsBoard.tsx`, `PostEditPage.tsx`, `PostEditor.tsx`, `AnalyticsSourcesPage.tsx`) and docs (`PAGE_MAP.md`, `API_CONTRACTS.md`, `PLAN.md` 183–184, DECISIONS row «Not done yet» → done, new `docs/design/ux/rubrics.md` + `UX_SPEC.md` index line, `docs/design/README.md` heat/status lines).
- [x] tests: L1, L2, L3 (30 d); frontend `msk`, `slot-badge`, fixtures, error matrix; design unit tests; L8 shots/overlap/axe on mocks.
- Done: verify; DEV: `/rubrics` forecast with `FORECAST_CAPABILITIES` shows 35 days a human can check against owner rules (agent reviews first, memory «review before showing»); real-DEV look 375/1280/1920.
- Prod: no migration; forecast read-only with honest `forecast_only`.

### Stage 4 — slot machinery, rubric layer, F2, rehearsal, prod go-live, migration 0119 (R3)
4a backend-core:
- [x] (31.10.2026; breakers, the `/status` line, health/purge steps and the browser ledger still open) `migrations/0119_rubric_scheduler.sql` (§4); `modules/rubric-scheduler/application/{claim-build,record-build-result,release-slot,project-slots,close-polls,check-health,purge,settings,read-calendar,read-rubrics,read-slot,ledger}.ts`, `infrastructure/{d1-slot,d1-settings,d1-marker,d1-breaker,d1-notice,d1-once-key,d1-budget}-repository.ts`; `app/rubric-scheduler/{runtime,tick,wiring,capabilities}.ts`; `app/workflows/{rubric-actor,rubric-build,rubric-release,rubric-project,rubric-notices}.ts`; `app/scheduled.ts` step; `app/ai-queue.ts` + `app/bot/ai-job.ts` `rubric_build`; `src/index.ts` runtime + build access; `app/env.ts` (`RUBRIC_SCHEDULER`, `RUBRIC_REHEARSAL_DESTINATION_ID`, `RUBRIC_REHEARSAL_CHAT_ID`, `BROWSER_DAILY_CAP_MS`); `app/lab/lab-cron.ts` job list; `app/bot/owner-reports.ts` `/status` line; `app/post-origins.ts` (`RUBRIC_ACTOR` origin mark); `platform/security/deterministic-uuid.ts` (+ test vs `z.uuid()`); dispatcher `refuseChat` for rehearsal (lab builds only); R2 media path; ledger + `pace()` lease; `wrangler.jsonc` (`env.production.vars.RUBRIC_SCHEDULER="on"`, `env.dev.vars.RUBRIC_SCHEDULER="rehearsal"` + rehearsal ids of the test channel destination, DEV cap 240000).
- [x] contracts: rest of `rubric-scheduler.ts` (C3–C8, slots/{id}), `settings.ts` `rubricScheduler` + frontend API layer, one commit.
4b backend-rubrics:
- [ ] (partly, 31.10.2026: the bank turn is the count of the rubric's slots, `INNER_RULES_READY` lists the bank rubrics; bank-pick, seeded random, topics and the bank index come with stage 6) `types.ts` (`BuildInput`, `RubricHistory`, `FollowUpSpec`, `BuiltRubricPost`), `bank-pick.ts`, `seeded-random.ts`, `inner-rules.ts`, `topics.ts`, `valve-values.ts`, `scripts/gen-bank-index.ts` + `bank-index.generated.ts` + npm script; builders take `input` for 04, 10, 15, 16, 17, 18, 19, 22, 23, 24, 25, 26, 27, 28, 29, 30 (C1–C3, C12–C14, C16–C20 fixes; 29 MSK day); `innerRulesReady` true only for those; `RubricSources.history` port wired in `rubric-build.ts`; lab path unchanged.
4c design-system D1: `DataTable.cardsBelow` (measured), rubric status keys, `RatioBar` (used from F5; may land here).
4d frontend F2 (§9.2) — done 31.10.2026 (switch, upcoming slots with detail and skip, rubric list with on/off and rest) + `BackgroundJobsPanel` row + `/lab` sentence; tests L7.
- [x] docs: NEW `docs/backend/rubric-scheduler.md` (state machine, locks, tables; linked from `docs/BACKEND_ARCHITECTURE.md` index), `docs/backend/cron.md`, `docs/API_CONTRACTS.md`, `docs/LOCAL_PREVIEW.md` (rehearsal vars), `docs/RUBRICS_SCHEDULER.md` status line (built parts only).
- [x] tests: L4 scheduler + rubric-layer L1 lists; budget; locks; rehearsal.
- Done (DEV, agents): lab master Cron on + `rubricScheduler` on + switch on ⇒ 3-day rehearsal into the test channel: every slot ends terminal, nothing outside the allowlist, no slot past deadline, bank rotation visible, `/status` line, notices bounded and «[DEV]»-tagged, 0 AI calls, browser ≤ 4 min/day.
- Prod: owner applies **0119**, develop→main PR; switch default off; owner turns it on and picks the channel ⇒ eligible: 15, 16, 18, 24, 25, 30 (L, no browser). Agents watch `/status` and «Рубрики» daily for 7 days.

### Stage P — Browser Rendering on prod (no migration; R2)
- [x] backend-core: `wrangler.jsonc` `env.production` `"browser": {"binding": "BROWSER"}` + `BROWSER_DAILY_CAP_MS=720000`; price page re-check recorded (31.10.2026: Workers Paid includes 10 browser hours a month, then $0.09/h; 12 min/day ≈ 6 h/month stays inside; `app/rubric-scheduler/browser-budget.ts`).
- [x] frontend: the budget line in «Автопубликация рубрик».
- Done: DEV unchanged; prod after the owner's release: 04 (plain answer), 10, 17, 19, 22, 23, 26, 27, 28, 29 become candidates; first week watched (budget line, failures).
- Prod: owner deploys the PR. Condition: 7 clean days of stage 4.

### Stage 5 — events, anchors, bets, similarity, 31, migration 0120 (R3)
- [x] backend-core: `migrations/0120_rubric_bets.sql`; live triggers in `domain/triggers.ts`; `app/workflows/process-dota-updates.ts` (dirty plan on patch; bet claim + `stopPoll`); 04 follow-up/hint wiring; bet row in ready batch, close in projection.
- [x] backend-rubrics: `patch-chain.ts`, `similarity.ts` (signatures into `sig_text/sig_lead`), `bet.ts`, `first-guess.ts`, `hero-aliases.ts`, `calendar-rules.ts`, `greeting-card(s).ts`; builders 01, 02, 03, 06 (split bet/result, `nerf-pictures.ts` timeout + share line), 07, 08 (`valve-time-pictures.ts` jokes by mark), 31; 31st key in contracts + `/lab` list + frontend (one commit); `innerRulesReady` for 01, 02, 03, 06, 07, 08, 31.
- [x] backend-analytics: `readThreadComments` use in the 04 answer build (owner answer 9 — no hint; «Первым угадал» done in stage 7).
- [x] frontend F3; design: chips.
- [x] tests: stage 5 L4 list, similarity calibration.
- Done: DEV rehearsal of a patch chain by replaying a past patch version into the test channel (03 and 31 only render there; others shown not-candidate); greeting dates checked.
- Prod: owner applies **0120**; uploads greeting backgrounds to R2; gives card hours (Q5).

### Stage 6 — remaining inner planners (no migration; R2)
- [x] (31.10.2026: history rules and facts in 05, 09, 10, 11, 12, 17, 19–23, 26, 29; 14 reads Valve numbers where the game has them, game-wide numbers rest a week after a patch; the AI turn writer for 13/14/20 waits for the owner's trial cost approval) backend-rubrics: `find-identity.ts`, `workshop-pick.ts`; builders 05, 09 (+ `integrations/steam-public` `gid`), 11, 12 (`chooseGuideHero`, no guessed-items fallback), 13, 14 (`values`, `watch`, `now_so`, overrides), 20 (`RECRUIT_BRIEF`), 21; `patchText`, `announcements`, `writer` ports; `modules/ai` bank-style writer + fact check; AI trial locally first (cost + cap stated).
- [x] (replaced by owner answer 8: no recheck list, numbers from Valve) backend-core: overrides repo + `POST …/rechecks/{entryKey}/clear` (+ contract + frontend API, one commit); owner list message per patch.
- [x] frontend F4 (nothing left: the recheck list is gone with answer 8).
- Done: DEV rehearsal of 13/14 in bank-only mode; prod candidates 05, 09, 11, 12, 13, 14, 20, 21 after `innerRulesReady`.

### Stage 6b — semantic similarity (no migration unless vectors need a column — then the next free number; R2)
- [ ] After 4 weeks of lexical data: Workers AI binding (`ai`) in wrangler, `bge-m3` embeddings as BLOB, threshold from labelled pairs; trial first; neuron cap in code. Owner approves the trial cost.

### Stage 7 — analytics, migration 0121 (R2)
- [x] backend-analytics: `modules/rubric-analytics/**`, `migrations/0121_rubric_analytics.sql`, `app/rubric-analytics-routes.ts`, `app/workflows/rubric-analytics.ts` (score, summary, week), `scheduled.ts` claims, `content-analytics` `readTelegramAgeSamples` + weekly-report block + rename, `modules/ai/comment-themes.ts`, `analytics-review.ts`, `rubric-writer.ts` `rules`; scheduler exports `RubricPostSource`, `WeekSlotsSummary`.
- [x] contracts `rubric-analytics.ts` + frontend API, one commit; frontend F5; design D2 (`SliceCard`, `ComparisonRow`).
- Notes (31.10.2026): owner answer 11 — no owner rules in rubric captions, so `rubric-writer.ts` `rules` was not added; slices and the comparison are drawn with the existing DataTable and a slice list (no new primitives); hero slices show the hero id until a hero catalogue is at hand; «Первым угадал» done here (answer stays a draft until release).
- Done: DEV shows not_connected/limited states honestly (scores skip test channel); prod after release: first block next Monday.
- Prod: owner applies **0121**.

### Stage 8 — learning, migration 0122 (R2)
- [x] backend-analytics: learning domain/app, `GET/PUT learning`; backend-core: `rubric_hour_slots` repo, `plan()` reads learned slots, `RestSettings.apply` / `HourPlan.apply`; `migrations/0122_rubric_learning.sql`; L3 365-day simulation.
- [x] frontend F6; design D3 `HeatGrid`.
- Notes (31.10.2026): trial hours (one pool slot in five an hour off) added to `plan()`, else the hour cells never fill; the L3 365-day simulation is covered by the plan property tests plus a learned-hours case; the heat grid is a feature-local table, not a shared primitive.
- Prod: owner applies **0122**; advise 28 d, then apply (Q10).

### Stage 9 — cleanup (R2)
- [ ] Remove the 0117 V0 shim after the owner confirms prod has 0117 (first release after).
- [ ] `migrations/0125_drop_content_rubrics.sql` only after prod runs without manual-rubric code; owner applies on prod after the code-removal release.
- [x] `docs/RUBRICS_SCHEDULER.md` status «built» (31.10.2026); the `docs/backend/publishing.md` shim note stays with the shim.
- Notes (31.10.2026): the shim removal and `0125_drop_content_rubrics.sql` wait for the owner (prod has 0117; the release without manual-rubric code is live) — d1-migration rule 9.

### Stage 10 — the DEV week-long test (owner, 31.10.2026; migration 0123)
- [x] The rehearsal posts to the channel the owner picks in «Рубрики», like production (`RUBRIC_REHEARSAL_DESTINATION_ID`/`_CHAT_ID` and the `REHEARSAL_DESTINATION` lock removed).
- [x] `RUBRIC_REHEARSAL_PACE=week` (DEV vars only): rests ÷ 8, six rubric slots a day an hour apart, polls close after 2 h, 04's answer after 1 h; AI/STRATZ/match-base rubrics go out as stubs (no paid call); the newest patch counts as out on the test's first day and the events a week may not bring are due on fixed test days.
- [x] One slot in four gets a staged failure in turn (build crash, build failure, build too late, Telegram 429, Telegram timeout, lost channel); Telegram failures stand in for the send (`DispatchDeps.rehearse`), Telegram is never called for them.
- [x] `rubric_rehearsal_checks` (0123): each slot's scenario, verdict (как задумано / не так / не в счёт) and why; `GET /api/v1/rubrics/rehearsal`, `/lab/rehearsal`.
- [x] Whether a rubric post went out and why not: «Рубрики» → «История» per rubric (`GET /api/v1/rubrics/{key}/slots`), Russian reasons (`contracts/rubric-reasons.ts`), rubric posts and slots on «Лента дня» (`DashboardDto.rubricSlots`, `rubricKey`).
- [ ] After the week: drop `rubric_rehearsal_checks` and the pace code (a later migration and PR), production stays untouched.

Agent assignment and parallelism: backend-core leads stages 0, 1, 3, 4a, P, 5 (core), 9; backend-rubrics stages 0 (rubrics part), 4b, 5 (builders), 6; backend-analytics stages 2, 5 (04 comments), 7, 8; design-system D0–D3; frontend F1–F6. Stage 2 runs in parallel with stage 3; 4b in parallel with 4a; shared files (`container.ts`, `scheduled.ts`, `ai-queue.ts`, `create-bot.ts`, `weekly-report.ts`) — land stage 2 first, others rebase. Subagent packets ≤ 40 lines with a path to `.logs/handoff/scheduler/<stage>.md`; fresh agents, never forks.

---

## 12. Risks and mitigations
| # | Risk | Mitigation |
|---|---|---|
| 1 | 0117 changes shared dispatch SQL; prod without it stops all publishing | owner applies before main (release step) + V0 shim + `SCHEMA_BEHIND` lock + deploy-without-0117 test |
| 2 | Duplicate send | one deterministic post id + idempotency key per slot, N1 lookup before every ready exit, conditional claims, `unknown` never retried, `not_after` |
| 3 | Late posts (03:00) | `not_after` = slot + 20 min, expiry in reconcile even with kill switch off |
| 4 | Silent stop | marker steps not gated by idle ticks, back-off + rotation, health every 15 min, existing heartbeat, `/status` line |
| 5 | Notice storms | day keys, cap 6 + summary, breakers |
| 6 | Bundle > limit after moving builders | dry-run gate in stage 0; icons to R2 |
| 7 | Build-time mutable state burns bank entries/heroes | pure scheduler ports, history-based picks, test «failed build consumes nothing» |
| 8 | Bank growth reshuffles rounds | `fnv1a(round:key)` order, new entries first; keys never change after use (test) |
| 9 | Browser/STRATZ shared quotas between DEV and prod | ledger caps per env (UTC day), D1 lease, rehearsal never calls STRATZ |
| 10 | Build longer than slot window | build_at slot − 3 h, deadline exits, two stats rubrics never same day |
| 11 | Lexical similarity thresholds wrong | bank calibration test, constants, weekly failure line, 6b later |
| 12 | 05 find identity heuristic | fixtures from real builds before stage 6 go-live |
| 13 | 14 hand numbers after patches | `watch` + owner recheck list (Q8); default block 7 d if unanswered |
| 14 | Discussion-group comments unverified | stage 2 live DEV check; `bot_blind_in_group` state; reply fallback |
| 15 | Personal data | HMAC key secret, username + text 10 d, no raw ids, never in prompts, purge bounded |
| 16 | Prompt injection via comments | JSON data block, code-built counts/quotes, labels never in prompts |
| 17 | Thin data, slow learning | «мало данных» everywhere, advise 4 weeks, shrinkage, bounded steps |
| 18 | Volume drift from learned rest | ≤ 3 changes/week + hard invariants |
| 19 | Owner reschedules/cancels a rubric publication | `manual`, `missed OWNER_CANCELLED` |
| 20 | Lifecycle purges posts | no FK, slot detail shows «пост удалён» |
| 21 | Rehearsal leaks to the main channel | var only on env.dev, allowlist at release and in the dispatcher (lab builds), test |
| 22 | Deploy before migrations | each module turns itself off with one log; endpoints 503 `MIGRATION_PENDING` |
| 23 | Shared-file merge collisions between parallel areas | landing order stage 2 → 3 → 4; rebase rule |
| 24 | RAC calendar weeks unsupported | spike; fallback roving grid |
| 25 | Container queries missing in old WebViews | narrow tier is the default style |
| 26 | Hotfix definition unclear | Q2 default coded |
| 27 | Mobile month grid heavy | reserved agenda height, `layout:check` |
| 28 | Contract drift FE/BE | one-commit rule + fixture parse test |

---

## 13. Owner answers (31.10.2026; these win over area files and earlier defaults)
1. Comment texts are kept 10 days (one constant).
2. Patch-chain hotfixes: one family (`7.41`, `7.41a`…) within 5 days of the first is one post; a letter version with hero changes later than 5 days starts a new chain.
3. 03 «Нерф или баф?»: add three jokes to `DONT_BOTHER_JOKES` — «Отъебись, у меня семейный ужин с отцами», «Ебал я ваши патчи вместе с Валвом», «Хуй знает, я сейчас сру» (8 in the bank, the 6-post repeat rule holds).
4. 08 «Валв-тайм» moved 1–2 days earlier: the picture shows the real day count.
5. 31 «Открытка»: the owner sets each card's hour himself later (card setting); two cards never share a date, so no collision rule.
6. 12 «Гайд на героя»: a random hero among the 5 most popular without a guide.
7. 09 «Оцениваем» without our news post: count 1–5 days from the announcement date.
8. 14 «Объясни как дебилу»: no hand-typed numbers — every number comes from Valve's live data like `on-lane.ts`; no manual «Проверено» step.
9. 04: no hint at 1.5 h; the plain answer only.
10. Learning: after 4 weeks of advice, rest and hours change on their own (with a switch).
11. The owner's Telegram text rules and approved «Учитывать» do NOT apply to rubric captions; rubrics keep their own rules.
12. Monday report: rename «🏷 Рубрики · Учу фидить…» to «🎬 Форматы видео».
13. Prod rubric channel: chosen in the enable dialog, the autopublish channel prefilled.
14. No «Неделя» view; Месяц + Список.
15. No `/__catalog`. Rare-state checks live in `/lab` (DEV and local only): sub-routes `/lab/<type>` with a submenu in the side menu, reachable straight from the admin; layout by the designer/analyst.
16. «Рубрики» is built to the maximum, a finished product from the start: manual rest edit, «Пропустить слот» and whatever else the analyst finds necessary (analyst lists it before the screens); no «v1 minimum».
17. Slot status labels as in «Публикации» («Опубликовано», «Требует проверки», «Публикуется»).

Owner actions (not questions): prod migrations 0117–0125 before each main PR; `AUDIENCE_HASH_KEY` on both environments; bot admin of the discussion group; «Подключить бота» after stage 2; the switch and channel at stage 4; the BROWSER deploy at stage P; greeting backgrounds to R2 at stage 5; Workers AI trial approval at 6b. Defaults A1–A6 (§7) stand unless vetoed.

---

## Appendix A — traceability (nothing from v2/v2.1/reviews lost)
| Item | Where |
|---|---|
| B1 plan conflicts / slot_at | §4 0119 inserts, plan() takes live slots; test `pool+event same slot_at` |
| B2 dedupe partial unique, ≤ 2 failed event slots | §4, §5; test `off→on restores`, `yield re-plans` |
| B3 ready exits, scheduledAt = slot_at, error classes | §5 |
| B4 not idle-gated, markers | §6.1; test `archive throws every tick` |
| H1 not_after | stage 1, §5 |
| H2 patch between build and release | §5 ready exits; test |
| H3 reservation at ready | `rubric_once_keys` in ready batch |
| H4 typed degradations, allowlist | stage 0, §7 |
| H5 lost build, breaker | §5 building |
| H6 gate fail-open | §5, `GATE_LOAD_STALE` |
| H7 capability map, no notices | §3.3, §2.2 #5 |
| H8 learning guards, CHECK 7..60 | §4, §8 |
| H9 no such table, audience pre-filter | §4 deploy-without, §8 |
| M1 guarded building→ready, release re-checks locks | §6.2, §5 |
| M2 no UPDATE slot_at, freeze | §5 planned |
| M3 jitter/exploration inside plan | §2.2 #11, L2 |
| M4 ledger, UTC day, STRATZ lease, browser lease | §4 0119, §6.3 |
| M5 projection mapping | §5 |
| M6 notice keys, cap, auto-recover | §6.3 |
| M7 audience filters, admin setup, health | §8, stage 2 |
| M8 HMAC secret, purge, ingest cap, AI escaping | §8 |
| M9 own meter 40 | §6.1 |
| M10 open_period, gapMs | §2.2 #20, stage 1 |
| N1 lookup before ready exits | §5; test `crash between create and released`, `Cron down until +5 min` |
| N2 prod migration before main | §11 common rule, stage 1 |
| N3 build output on slot, recreate post | 0119 `build_json`, §6.2 |
| N4 owner reschedule ⇒ manual | stage 1, §5 |
| N5 marker back-off + rotation | §6.1 |
| N6 replacement insert NOT EXISTS | §4 |
| N7 publishing/bot lock | §3.3 |
| N8 UUID v8 | §6.2, test vs `z.uuid()` |
| N9 rehearsal allowlist | §2.2 #12 |
| N10 health only when locks on; DEV notices tagged | stage 4 done-criteria |
| N11 ON CONFLICT predicate, DUE_JOBS_SQL, d1-budget comment | §4, §6.3 |
| Low: OWNER_PREAPPROVED/RUBRIC_ACTOR not via HTTP; rubric_build no chat_id; lost-ai-jobs duplicate | L6, §6.2 |
| review-backend: STRATZ_GAP_MS single; slot lease only recovery; actor constant; post after guarded ready; one release per tick test | stage 0, §6.2, §5, L4 |
| review-qa missing tests | L4 lists (two release ticks, crash replay, sweeper without idle ticks, preview outage, NaN learning, ledger concurrency, kill switch expiry, deploy without migration, foreign flood, retention flood, worst tick, lock var) |
