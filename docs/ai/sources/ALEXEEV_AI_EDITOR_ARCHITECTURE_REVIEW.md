# ALEXEEV AI Editor — вопросы к архитектуре и как должно быть

Цель этого файла: проверить AI-редактор **до подключения модели** и не получить обычный «чат внутри админки».

Нужный конечный результат:
**мысль / инфоповод → релевантный контекст → черновик → проверка стиля → правки владельца → публикация → аналитика → вывод → обновление редакционной памяти → следующий текст становится точнее.**

При ответе на этот документ по каждому пункту нужно писать:

1. **Что уже реализовано**
2. **Где именно в коде / БД**
3. **Чего пока нет**
4. **Как это будет реализовано**
5. **Как проверить, что работает**
6. **Какие токены / деньги это добавляет**

---

# P0 — без этого нельзя включать «самообучение»

## 1. Аналитика сравнивает ролики внутри одной рубрики?

### Вопрос
Когда система решает, что ролик «залетел» или «провалился», с чем именно она его сравнивает?

Нельзя сравнивать:
- «Учусь играть» с «Учу фидить»;
- standalone Reels с рубриками;
- ролики разного возраста;
- TikTok и YouTube как одну выборку.

### Как должно быть

Основной baseline:

`platform + format/rubric + checkpoint age`

Пример:

`TikTok + uchu-fidit + T+24h`

Fallback, если мало данных:

1. та же рубрика + соседний checkpoint;
2. та же платформа + похожий формат;
3. общий platform baseline, но обязательно помеченный как слабый fallback.

### Минимальные категории

- `fidit`
- `igrat`
- `standalone`
- `telegram`

Позже можно расширять.

### Acceptance criteria

Для ролика «Учусь играть» система **не использует БКБ/варды/драфт** как основную базу сравнения.

---

## 2. Есть ли provenance каждого текста?

### Вопрос
Система знает, **кто реально написал текст**?

Нельзя допустить, чтобы AI через полгода учился на собственных черновиках, считая их оригинальным стилем ALEXEEV.

### Как должно быть

У каждого текста / версии должен быть источник:

- `OWNER_ORIGINAL`
- `OWNER_TRANSCRIPT`
- `AI_DRAFT`
- `OWNER_EDITED`
- `OWNER_APPROVED`
- `PUBLISHED`

Дополнительно:

- `rubric/format`
- дата;
- generation id;
- parent revision;
- published content id;
- модель;
- prompt/profile revision.

### Приоритет для стилевой памяти

`OWNER_ORIGINAL > OWNER_EDITED > OWNER_APPROVED > OWNER_TRANSCRIPT > AI_DRAFT`

AI_DRAFT никогда не должен становиться «доказательством стиля» без подтверждения владельца.

### Acceptance criteria

Можно взять любой пример из retrieval и понять:
**откуда он появился, кем написан и публиковался ли он.**

---

## 3. Связан ли AI draft с финальным опубликованным роликом?

### Вопрос
После публикации система точно знает, **какой текст реально вышел**?

### Как должно быть

Цепочка:

`generation`
→ `draft_revision`
→ `owner_final_revision`
→ `publication`
→ `platform_content_item`
→ `analytics snapshots`
→ `72h review`
→ `learning evidence`

Важно: аналитика привязывается к **финальной опубликованной версии**, а не к первому AI-черновику.

### Acceptance criteria

По TikTok video id можно дойти обратно до:
- исходного задания;
- AI draft;
- всех правок владельца;
- финального текста;
- использованного style/profile revision;
- аналитического review.

---

## 4. Сохраняется ли draft → owner final diff?

### Вопрос
Система умеет увидеть, **что именно владелец постоянно исправляет у AI**?

### Как должно быть

После утверждения хранить:

- original AI draft;
- final owner text;
- diff;
- edit ratio;
- какие части изменены:
  - hook;
  - структура;
  - мат;
  - шутка;
  - CTA;
  - механики;
  - длина;
  - AI-sounding wording.

Не надо сразу превращать каждый diff в правило.

Сначала это **evidence**.

### Acceptance criteria

Можно построить статистику:

> «За последние 20 сценариев владелец переписывает 65% AI-хуков, но только 12% середины текста».

---

# P0 — контекст и токены

## 5. Модель получает только нужный контекст?

### Вопрос
Отправляется ли весь архив в каждый запрос?

Ответ должен быть: **нет**.

### Как должно быть

Всегда:

- `core voice`
- нужный `format card`
- короткий `lessons / my experience`
- `output rules`

По retrieval:

- 3–4 релевантных примера;
- до ~15 релевантных lexicon entries;
- релевантные подтвержденные edit-rules;
- только нужные факты задачи.

Не отправлять в модель:

- все 520 Telegram-постов;
- все 37 Reels;
- Word-файлы;
- весь Analytics Journal;
- все старые гипотезы;
- весь Dota lexicon.

### Целевой бюджет

Ориентир для обычного Reels draft:

- stable prefix: ~1.5–2k tokens;
- examples: ~0.7–1k;
- retrieval rules/lexicon: ~0.2–0.5k;
- task: ~0.2k;
- output: ~0.5–0.8k.

Ориентир: **~3–4k input tokens**, а не десятки тысяч.

### Acceptance criteria

В usage log видно:
- input tokens;
- cached tokens;
- output tokens;
- cost;
- generation kind.

И можно увидеть среднюю стоимость одного draft.

---

## 6. Разделены ли STATIC VOICE и CURRENT STATE?

### Вопрос
Не хранится ли временная информация внутри вечного style core?

Например:
- текущий ранг;
- текущие любимые герои;
- текущий прогресс;
- свежие мемы;
- состояние конкретной рубрики.

### Как должно быть

**STATIC VOICE**
- язык;
- мат;
- ритм;
- самоирония;
- anti-AI;
- тип юмора;
- редакционные запреты.

**CURRENT STATE**
- текущий ранг;
- что сейчас учит;
- свежие темы;
- актуальные герои;
- недавние события;
- временные CTA;
- текущие эксперименты.

Static voice меняется редко.
Current state можно обновлять часто.

### Зачем

Так:
- меньше prompt churn;
- лучше cache hit;
- меньше риск устаревшего контекста;
- проще понимать, что является стилем, а что временным фактом.

---

# P1 — режимы генерации

## 7. Разделены ли ручной и автоматический режимы?

### Вопрос
AI одинаково работает, когда:
1. владелец напрямую просит сценарий;
2. система сама нашла инфоповод?

Не должен.

### Как должно быть

### Direct mode

Владелец пишет:
> «сыграл 5 игр на герое, вот мои мысли...»

AI может:
- сохранить 2–4 живые фразы владельца;
- предложить 3 hook-варианта;
- собрать 1 полный сценарий;
- задать вопрос, если не хватает личного опыта.

### Automatic mode

Источник нашёл патч / новость.

AI:
- получает только подтвержденные facts;
- пишет **один draft**;
- ничего не выдумывает про опыт владельца;
- не генерирует 3 лишних варианта;
- сохраняет provenance source facts;
- ждёт approve, если правила публикации требуют approve.

### Acceptance criteria

Автоматический новостной пост не содержит:
> «я попробовал», «мне понравилось», «я играл»

если этого не было во входных данных.

---

## 8. Где используется дорогая модель, а где дешёвая?

### Как должно быть

**Draft model**
- Reels;
- сложные standalone posts;
- итоговый текст, где важен авторский голос.

**Cheap model**
- классификация;
- теги;
- simple review;
- extraction;
- подбор rule candidates;
- weekly consolidation;
- anti-AI review только если deterministic checks уже нашли проблему.

### Нельзя

Запускать дорогую модель:
- для connection checks;
- для простого tagging;
- для подсчётов;
- для deterministic вещей;
- для каждого analytics snapshot.

---

# P1 — anti-AI

## 9. Anti-AI проверка не превращает текст в ещё более AI-шный?

### Вопрос
После генерации всегда запускается второй LLM-pass?

Лучше: **нет**.

### Как должно быть

Сначала дешёвые deterministic checks:

- запрещённые обороты;
- слишком много симметричных конструкций;
- повтор одинаковых связок;
- слишком гладкий CTA;
- неправильная концовка рубрики;
- слишком длинный текст;
- лишние заголовки/emoji;
- «не просто X, а Y» и подобные конструкции.

Только если найден риск:
→ cheap model review;
→ rewrite только проблемного фрагмента или короткая targeted rewrite.

### Acceptance criteria

Нормальный текст не переписывается просто потому, что «на всякий случай проверим второй моделью».

---

# P0/P1 — редакционная память

## 10. Как правило попадает в «Мой опыт»?

### Вопрос
Может ли один успешный ролик превратиться в вечное правило?

Ответ: **нет**.

### Как должно быть

У learning rule есть:

- `id`
- `statement`
- `scope` (`fidit`, `igrat`, standalone, telegram...)
- `source_type` (`edit`, `analytics`, `owner_manual`)
- `evidence_count`
- `supporting_items`
- `contradicting_items`
- `confidence`
- `created_at`
- `last_confirmed_at`
- `decay/weight`
- `status`

Статусы:

`candidate`
→ `supported`
→ `strong`
→ `deprecated`

### Пример

**Candidate**
> Конкретный спорный тезис в «Учу фидить» сильнее абстрактного статистического хука.

Evidence:
- BKB — strong positive;
- carry90 — contaminated by recommendation restriction;
- следующий чистый тест — pending.

Это **не strong rule**, пока нет чистых повторных подтверждений.

### Acceptance criteria

У каждого правила можно открыть evidence и увидеть:
**почему система вообще в это верит.**

---

## 11. Аналитика отделяет факт от гипотезы?

### Как должно быть

Факт:
> BKB: X views, Y shares at T+72.

Наблюдение:
> shares/1000 выше медианы рубрики.

Гипотеза:
> конкретный спорный хук мог увеличить пересылки.

Нельзя хранить:
> «ролик залетел потому что хук был хороший»

как доказанный факт.

### Acceptance criteria

AI review формулирует причинность осторожно:
- «возможно»;
- «гипотеза»;
- «подтверждается ещё N роликами»;
- «есть confounder».

---

## 12. Есть ли защита от confounders?

Для анализа Reels учитывать хотя бы:

- recommendation restriction;
- возраст ролика;
- different rubric;
- герой / тема;
- время публикации;
- platform;
- технические проблемы;
- удаление / ограничение;
- paid/organic anomaly, если когда-нибудь появится;
- неполные данные.

Пример Carry90:
ограничение рекомендаций → нельзя делать чистый вывод «текст слабый».

---

# P1 — аналитический flow

## 13. Что происходит на T+72?

### Как должно быть

Не просто:
> «584k views — супер».

Нужен короткий structured review:

1. результат против baseline той же рубрики;
2. views velocity;
3. shares per 1000;
4. likes/comments per 1000;
5. hook;
6. тема;
7. текстовая структура;
8. возможные confounders;
9. что сохранить;
10. что проверить следующим роликом.

### Output

- 1–3 observations;
- максимум 1–2 hypotheses;
- next test;
- никаких автоматических permanent rules.

---

## 14. Weekly learning не раздувает prompt?

### Как должно быть

Раз в неделю:

- собрать новые edit evidence;
- собрать video reviews;
- объединить дубли;
- повысить/понизить confidence;
- удалить устаревшее;
- сделать компактный `My Experience`.

Цель `My Experience`:
**несколько сотен токенов**, а не бесконечный лог.

Полный evidence хранится в БД, но не отправляется каждый раз в prompt.

---

# P1 — метрики качества самого AI-редактора

## 15. Мы измеряем, становится ли AI реально ближе к ALEXEEV?

Главная метрика:
**edit ratio**.

Дополнительно:

- hook edit ratio;
- full rewrite rate;
- accepted with minor edits;
- accepted unchanged;
- generation cost;
- time to approval;
- owner rating;
- «шутка не зашла»;
- «не мой стиль»;
- «факт неверный».

### Нельзя

Считать качество AI по:
- длине ответа;
- LLM-judge score без калибровки;
- красивости текста;
- самому AI saying «style match 9/10».

---

## 16. Есть blind test?

Периодически:

- 5–10 реальных текстов ALEXEEV;
- 5–10 AI-текстов на похожие темы;
- перемешать;
- человек угадывает, где AI.

Цель:
AI-тексты не должны стабильно определяться как AI.

Дополнительно владелец выбирает лучший вариант между:
- current model/profile;
- candidate model/profile.

---

# P1 — retrieval

## 17. Как выбираются 3–4 примера?

Не только «та же рубрика».

Ranking желательно учитывать:

1. same format;
2. same topic/entity;
3. similar intent;
4. similar length;
5. gold/approved examples;
6. recent owner-edited examples;
7. anti-example только если задача рискует повторить ту же ошибку.

### Важно

Последний пример перед task желательно делать самым релевантным.

---

## 18. Lexicon подгружается по match, а не целиком?

Да.

Подгружать только совпадающие/релевантные:
- hero;
- item;
- mechanic;
- meme;
- slang.

Нельзя пихать все ~292 записи в каждый запрос.

---

# P1 — безопасность автоматического контента

## 19. AI пишет только из подтвержденных facts?

Для патчей / официальных новостей:

`source → parser/rules → confirmed facts → AI wording`

AI не является источником фактов.

Если источник неофициальный:
- provenance;
- label «слух / утечка»;
- approve policy.

### Acceptance criteria

Можно открыть пост и увидеть, на каких source facts он основан.

---

## 20. Approval policy явно задана?

Должно быть понятно для каждого типа контента:

- `manual_only`
- `draft_requires_approval`
- `auto_publish_allowed`

На первом этапе лучше:
**AI создаёт draft, публикация только после approve владельца.**

Автопостинг можно расширять позже для низкорисковых форматов.

---

# P2 — потом

## 21. Embeddings

Для 520 Telegram + Reels можно один раз посчитать embeddings и хранить локально/D1.

На каждый запрос:
- embedding task;
- cosine similarity;
- retrieve top candidates.

Не нужен Vector DB на таком масштабе, если Worker спокойно считает cosine по небольшой базе.

---

## 22. Prompt caching

Нужно не предполагать, что caching экономит.

Нужно смотреть реальные поля:

- input tokens;
- cached input;
- cache write;
- cost.

Stable prefix держать в одном порядке.

Если cache hit редко из-за частоты запросов:
не усложнять архитектуру ради него.

---

# Предлагаемая схема данных

Минимально нужны сущности уровня:

## ai_generations

- id
- kind
- format
- model
- profile_revision
- prompt_revision
- task
- output
- input_tokens
- cached_tokens
- output_tokens
- cost
- created_at

## ai_text_revisions

- id
- generation_id
- parent_id
- provenance
- text
- created_at
- owner_approved_at

## ai_edit_feedback

- generation_id
- final_revision_id
- diff
- edit_ratio
- tags
- owner_feedback

## content_ai_links

- final_revision_id
- publication_id
- platform_item_id

## ai_learning_evidence

- id
- source_type
- source_id
- scope
- observation
- weight

## ai_learning_rules

- id
- statement
- scope
- status
- confidence
- evidence_count
- contradiction_count
- created_at
- updated_at
- last_confirmed_at

## ai_rule_evidence

- rule_id
- evidence_id
- direction (`support` / `contradict`)

---

# Предлагаемый runtime flow

## Прямой запрос владельца

`owner input`
→ classify format
→ retrieve format card
→ retrieve 3–4 examples
→ retrieve relevant edit-rules
→ retrieve lexicon
→ draft model
→ deterministic checks
→ optional cheap review
→ show draft
→ owner edits
→ save final + diff
→ approve
→ publish
→ link platform item
→ analytics checkpoints
→ T+72 review
→ learning evidence
→ weekly consolidation

---

## Автоматический инфоповод

`source`
→ normalize
→ dedupe
→ confirmed facts
→ classify content type
→ retrieve Telegram style/examples
→ one AI draft
→ deterministic checks
→ save with source provenance
→ owner approve/edit
→ publish
→ analytics
→ feedback loop

---

# Что считать готовностью к подключению модели

До реального включения AI желательно закрыть:

- [ ] rubric-aware baselines;
- [ ] provenance;
- [ ] draft → final → publication → analytics linkage;
- [ ] generation + token/cost logging;
- [ ] context assembler;
- [ ] retrieval 3–4 examples;
- [ ] lexicon retrieval;
- [ ] direct vs automatic mode;
- [ ] deterministic anti-AI checks;
- [ ] save owner edits;
- [ ] edit ratio;
- [ ] learning evidence schema;
- [ ] learning rules with confidence/evidence;
- [ ] T+72 review format;
- [ ] weekly compact `My Experience`;
- [ ] owner-visible rule management;
- [ ] tests that one video cannot create a strong permanent rule.

---

# Что уже выглядит правильно и лучше не ломать

- OpenAI behind one provider port;
- `store:false`;
- key only as Worker secret;
- separate draft/cheap models;
- AI off by default;
- daily + monthly hard budget;
- token/cost ledger;
- stable compact `docs/ai/pack`;
- separate format cards;
- 3–4 examples instead of whole archive;
- lexicon retrieval instead of full lexicon;
- original source files kept outside model prompt;
- Dota patch facts extracted before AI wording;
- same-age checkpoints T+1/3/6/12/24/48/72;
- hypotheses should not become rules after one video.

---

# Финальная контрольная фраза

Если архитектуру нельзя объяснить как:

> **«AI пишет из маленького релевантного контекста, хранит мои правки, связывает финальный текст с результатом ролика, делает осторожные выводы внутри той же рубрики и добавляет в память только подтверждённые правила»**

значит система ещё не готова быть редактором ALEXEEV.

---

# FOLLOW-UP ПОСЛЕ ОТВЕТА CLAUDE — 16.10.2026

Ответ в `docs/ai/architecture.md` в целом принят. Направление хорошее. Перед реализацией learning loop нужно поправить следующие пункты.

## 1. Не использовать соседний checkpoint как обычный fallback

В `architecture.md` сейчас предложено:

`same format → neighbouring checkpoint → platform baseline`.

Это нужно изменить.

### Как должно быть

Основное сравнение:

`platform + format/rubric + exact checkpoint age`

Пример:

`TikTok + fidit + T+24`.

Нельзя сравнивать T+24 с T+12 как обычную замену: это нарушает принцип одинакового возраста.

### Минимальный порог

Надёжный baseline строится только при:

`N >= 5 clean items`

одной:
- platform;
- rubric/format;
- exact checkpoint.

Если N < 5:
- показать, что rubric baseline пока недостаточен;
- можно дать общий baseline той же платформы и **того же checkpoint** только как слабый ориентир;
- такой fallback явно маркировать как `weak comparison`;
- не использовать его как сильное evidence для learning rule.

---

## 2. Не классифицировать новый ролик cheap-model вызовом, если формат уже известен

Для контента, который родился внутри AI-редактора, формат известен заранее.

### Как должно быть

`generation.format → final_revision.format → published content item.format`

Cheap-model classification нужна только для:
- старых импортированных роликов;
- внешних публикаций без связи с generation;
- legacy content, где format неизвестен.

Не нужно тратить отдельный model call на классификацию каждого нового ролика по title.

Это:
- дешевле;
- точнее;
- сохраняет provenance.

---

## 3. Runtime memory должна жить в D1, а не в изменяемых Git-файлах

Сейчас `pack/state.md` полезен как разделение static/current, но живое состояние приложения не должно обновляться через Git.

Также weekly learning не должен физически переписывать `pack/lessons.md` из Worker.

### Как должно быть

### Static / versioned in Git

- `core.md`
- `format-*.md`
- `output.md`
- seed/default values
- редакционные системные правила

### Dynamic / runtime in D1

- `current_state`
- `learning_rules`
- `learning_evidence`
- `my_experience`
- owner-added preferences
- temporary experiments
- current rank / heroes / CTA state

Context assembler собирает:

`static Git pack + dynamic D1 memory + retrieved examples + task`.

`pack/state.md` можно оставить как seed/fallback/default, но не как основной runtime storage.

`pack/lessons.md` — тоже seed/manual source. Weekly consolidation должна писать в D1 `my_experience`, а не коммитить Git.

---

## 4. «Ролик перестал набирать» сам по себе НЕ является confounder

В текущем ответе сказано, что flagged video можно исключать из baselines/rules. Здесь нужна более строгая логика.

Ролик, который просто перестал набирать просмотры, может быть обычным слабым роликом. Его как раз нельзя выбрасывать из обучения.

### Исключать / понижать вес только при подтверждённом confounder

Например:
- recommendation restriction;
- removed / unavailable;
- platform incident;
- incomplete analytics;
- технический сбой сбора;
- явно повреждённые данные;
- другой подтверждённый внешний фактор.

### Не считать confounder автоматически

- `stopped gaining views`;
- низкие просмотры;
- плохой share rate;
- ранний plateau.

Это результаты, а не причины исключения.

Carry90 — пример contaminated case, потому что было ограничение рекомендаций. Обычный слабый ролик без ограничения должен оставаться в baseline и evidence.

---

## 5. Approval policy пока не должна считаться полностью BUILT для AI

В product policy уже правильно зафиксировано:

> ничего не публикуется без подтверждения владельца.

Но AI generation pipeline ещё не построен, поэтому runtime enforcement для AI drafts пока отсутствует.

### Корректный статус

- Product rule / decision: **accepted**
- Existing normal publishing approval: **built**
- AI-specific guard: **missing/designed until AI draft pipeline exists**

Нужен реальный state transition:

`AI_DRAFT → OWNER_EDITED/OWNER_APPROVED → publishable`

И тест, что:
- `AI_DRAFT` нельзя отправить в publication;
- automatic news generation не может обойти approval;
- publish endpoint/command проверяет approved revision, а не только UI-кнопку.

---

# Дополнительное уточнение по readiness

До включения learning loop считаем P0:

1. exact-age same-format baseline с `N >= 5 clean`;
2. provenance;
3. draft → final → publication → platform item → analytics;
4. runtime dynamic memory в D1;
5. owner approval guard;
6. confirmed confounder semantics;
7. AI_DRAFT никогда не попадает в style retrieval как доказательство стиля.

После этого можно строить:
- T+72 review;
- evidence;
- candidate/supported/strong rules;
- weekly `My Experience`.

---

# Итог

Текущий `docs/ai/architecture.md` в целом хороший и принят как основа.

Главная поправка к архитектуре:

> **Git хранит стабильную редакционную систему. D1 хранит живую память. Аналитика сравнивает только одинаковый возраст и формат при достаточной чистой выборке. Слабый ролик не исключается только потому, что перестал расти. Новый контент не классифицируется моделью, если его формат уже известен. AI-текст не может попасть в публикацию без реального server-side owner approval.**

