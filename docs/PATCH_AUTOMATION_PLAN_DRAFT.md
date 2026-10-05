# ALEXEEV — Dota 2 Patch & Event Automation Plan

**Status:** Draft for owner approval  
**Scope:** Product/functionality plan for automatic Dota 2 patches, important updates, and major in-game events. No implementation is approved by this document yet.

## 1. Goal

ALEXEEV should automatically detect official Dota 2 patches and important game updates, prepare a short Telegram post in the approved ALEXEEV style, generate a matching horizontal visual card, and publish it to the Telegram channel without waiting for manual approval.

This feature is intended to work especially when Valve publishes updates late at night.

## 2. User-facing result

For every supported patch/update, the channel receives:

1. A horizontal visual card.
2. A short Russian headline.
3. A concise summary of what changed.
4. A light ALEXEEV-style joke when appropriate.
5. A link to the official Valve/Dota 2 source at the bottom.

The post must answer one question quickly:

> What happened, and is this update important?

The bot should not try to reproduce the full patch notes.

## 3. Publication mode

**Mode:** automatic publication.

Owner confirmation is **not required** for this rubric when:

- the update is detected from an approved official source;
- the source is reachable;
- the patch/update identity is unambiguous;
- the generated post passes the rubric rules.

If those conditions are not met, the system does not invent missing facts and does not publish an uncertain post automatically.

## 4. Supported update types

The system should classify updates into a small number of practical categories.

### 4.1 Major patch

Examples: `7.42`, `7.43`.

Typical meaning:

- large gameplay changes;
- map/system changes;
- major hero/item changes;
- new mechanics.

Visual label examples:

- `ОГРОМНЫЙ ПАТЧ`
- `БОЛЬШОЕ ОБНОВЛЕНИЕ`
- `НОВАЯ ДОТА`

Text style:

- 3–5 most important confirmed changes;
- slightly more context than other patch types;
- one short joke is allowed.

### 4.2 Balance patch

Examples: `7.41f`, `7.42b`.

Typical meaning:

- hero buffs/nerfs;
- item changes;
- economy/balance adjustments.

Visual label examples:

- `БАЛАНСНЫЙ ПАТЧ`
- `БАЛАНС`
- `VALVE СНОВА КРУТИТ ЦИФРЫ`

Possible joke style:

- `Valve опять выдала +1 / -1 по статам`
- `Кому-то +2 брони, кому-то минус настроение`

### 4.3 Micro patch

Small lettered update with limited changes.

Visual label examples:

- `МИКРОПАТЧ`
- `НЕБОЛЬШОЕ ОБНОВЛЕНИЕ`
- `ЧУТЬ-ЧУТЬ ПОДКРУТИЛИ`

Possible joke style:

- `Ничего серьёзного. Просто у твоего героя снова -2 брони`
- `ИИ Valve снова сделал +1 / -1 по статам`

### 4.4 Hotfix / bugfix

An update mainly focused on bug fixes, crashes, broken interactions, or urgent corrections.

Visual label examples:

- `HOTFIX`
- `ЭКСТРЕННЫЙ ФИКС`
- `СРОЧНОЕ ОБНОВЛЕНИЕ`

Possible joke style:

- `Пофиксили то, что сломали ночью`
- `Патч ещё не дочитали, а его уже чинят`


### 4.5 Major in-game event

A large named Dota 2 event is **not treated as just another patch bullet**.

Examples:

- a new story event;
- a Crownfall-like progression event;
- a major seasonal event;
- a new event map/progression system;
- a named event with its own rewards, chapters, mechanics, or major cosmetic content.

When such an event launches together with a normal game update, the system should normally create:

1. a **patch/update post** about gameplay/balance changes, if there are meaningful gameplay changes;
2. a **separate event post** explaining the event itself.

The event post should not be buried inside:

```text
— ещё добавили новый ивент
```

because a large event is a separate reason for a subscriber to open the channel.

#### Event importance rule

Create a separate event post when several of these signals are present:

- Valve gives the event its own official name;
- the event has its own announcement/page;
- there is a progression system, map, chapters, quests, or tickets;
- there are unique rewards/personas/treasures/sets;
- the event is intended to run for more than a one-off match/update;
- the event materially changes what players can do in the Dota 2 client.

A small cosmetic drop or a few store items alone should not automatically be classified as a major event.

#### Event post style

The post should stay short and answer:

> Что это? Что там делать? Что можно получить?

Recommended structure:

```text
🎪 В Dota 2 начался «Тёмный карнавал»

Valve запустила новый большой сюжетный ивент.

Коротко:
— отдельная история и карта события;
— играем матчи и продвигаемся по ивенту;
— открываем награды, сеты и другие предметы.

Главные герои истории — Legion Commander и Hoodwink,
а за всем этим, конечно же, стоит Ringmaster.

В общем, в Доте теперь можно не только терять MMR,
но и делать это ради билетов в цирк.

🎟 Подробнее: <official event link>
```

Exact facts must always come from the detected official event announcement.

#### Real example: Dark Carnival

`Dark Carnival` launched as a named ongoing Dota event in June 2026. Its first part, `Midnight Run`, follows Legion Commander and Hoodwink through Ringmaster's prison train. Valve announced a fully voiced story, five new Automaton Personas, 20 new hero sets, and event rewards/content.

For ALEXEEV this would be classified as:

- **type:** major in-game event;
- **publication:** separate automatic post;
- **not merged into:** a normal balance-patch summary;
- **visual:** preferably official event/key art with ALEXEEV typography; if unavailable, a wide event-specific fallback card;
- **text:** short overview, not a full guide.

Possible ALEXEEV post:

```text
🎪 В DOTA 2 НАЧАЛСЯ «ТЁМНЫЙ КАРНАВАЛ»

Valve выкатила большой сюжетный ивент.

Коротко:
— новая история с Legion Commander и Hoodwink;
— отдельная карта и прогресс события;
— новые награды, сеты и 5 Automaton Persona.

За всем этим стоит Ringmaster.

Короче, нас официально позвали в цирк.
Как будто обычного рейтинга было мало.

🎟 Подробнее: <official event link>
```

The first announcement should explain the event only briefly. Detailed guides, best rewards, fastest progression, chapter releases, and later event changes are separate possible content types and are **not automatically part of the launch post**.

## 5. Visual card

### 5.1 Format

The default format should be **horizontal**, with width clearly greater than height, so it looks natural in the Telegram feed.

Target direction:

- approximately 16:9 or similar wide ratio;
- readable on mobile;
- no portrait card as the default.

### 5.2 Base layout

Top:
- small Dota 2 icon/logo.

Center:
- very large patch number, for example `7.41f`.

Below:
- short category label, for example `БАЛАНСНЫЙ ПАТЧ`.

Bottom/subtitle:
- one short phrase explaining the update or making a light joke.

Footer:
- small `ALEXEEV` branding.

### 5.3 Visual fallback

If there is no suitable official artwork, hero image, or item art:

**do not generate fake Dota heroes.**

Use:

- gradient/cinematic background;
- abstract Dota-like atmosphere;
- large patch number;
- category label;
- short subtitle.

This fallback is considered a normal production template, not an emergency compromise.

### 5.4 Character and item art

If we later use heroes/items in patch cards:

- use real approved game assets where possible;
- do not generate lookalike heroes with AI;
- do not show a character that can be mistaken for the wrong Dota hero.


### 5.5 Event visual

For a major named event:

- prefer the official Valve event/key art when it is available and suitable;
- add only our typography/branding around the official visual;
- do not redraw official Dota characters with AI;
- if no suitable art is available, use a wide event-specific fallback card with the event name and a short subtitle.

Example fallback:

```text
DOTA 2

ТЁМНЫЙ
КАРНАВАЛ

НОВЫЙ СЮЖЕТНЫЙ ИВЕНТ
```

## 6. Post structure

Recommended structure:

```text
🚨 Вышел патч 7.42

Коротко:
— главная тема / изменение №1
— главная тема / изменение №2
— главная тема / изменение №3
— при необходимости тема №4

Короткая шутка / реакция ALEXEEV.

📖 Полный патч: <official link>
```

For a small update:

```text
⚡ Вышел 7.41f

Valve немного подкрутила баланс:
— важное изменение №1
— важное изменение №2
— важное изменение №3

Valve опять сделала +1 / -1 по статам.

📖 Все изменения: <official link>
```

## 7. Content rules

The system must:

- write in Russian;
- keep the post short;
- mention only confirmed changes;
- keep the official source link;
- clearly separate facts from jokes;
- avoid copying the entire patch notes;
- avoid inventing interpretations when the official information is unclear.

The system may:

- use short ALEXEEV-style humor;
- use colloquial Russian;
- vary the joke between posts;
- use different wording for major, balance, micro, and hotfix updates.

The system must not:

- fabricate hero/item changes;
- claim something is a nerf/buff when that conclusion is uncertain;
- publish rumors as official patch information;
- generate fake Dota characters for the card.


## 8. How the system selects the main changes

The bot must **not** simply take the first lines of the official patch notes.

For every patch, the system should identify **2–4 main changes or themes** that best explain what actually changed in the game.

A “main change” can be:

- one large system/gameplay change;
- one major hero rework or a package of buffs/nerfs to one hero;
- one important item change;
- a group of related balance changes that form one clear theme;
- a critical bugfix or exploit fix.

### 8.1 Importance signals

Each change can receive an internal impact score based on several signals.

#### Gameplay impact

Higher priority:

- new mechanics;
- removed mechanics;
- map/system changes;
- meaningful economy changes;
- ability reworks;
- large buffs/nerfs.

Lower priority:

- tiny numeric changes;
- cosmetic wording changes;
- minor tooltip fixes.

#### Popularity

If current data is available, changes to popular heroes/items should rank higher.

Possible signals:

- hero pick rate;
- hero win rate;
- item popularity;
- current meta presence.

Example:

- a nerf to a hero picked in a large share of matches is more likely to be included;
- `+1 armor` to a rarely picked hero is usually not a top-line change.

#### Magnitude

The size of the change matters.

Examples:

- `30% → 25%` lifesteal can be more important than `+100 gold` recipe cost;
- several nerfs to the same hero can together be more important than one isolated small number change.

#### Breadth

Changes affecting many players rank higher.

Examples:

- map changes;
- economy changes;
- widely purchased items;
- global mechanics.

#### Change bundle

If one hero/item receives several related changes, they should usually be summarized as one main theme instead of several separate bullets.

Example:

```text
Shadow Fiend noticeably nerfed
— Necromastery changed
— Shadowraze weakened
— talent weakened
```

This is better than filling three top bullets with three separate Shadow Fiend lines.

#### Bugfix importance

Bugfixes should appear among the main changes only when they are materially important, for example:

- exploit fixed;
- crash/server issue fixed;
- broken interaction affecting normal matches;
- widely discussed bug fixed.

Minor bugfixes should stay out of the short Telegram summary.

### 8.2 Rule-based selection first

Selection should rely primarily on:

- official patch structure;
- numeric change magnitude;
- number of related changes;
- gameplay category;
- current hero/item popularity data when available;
- explicit rules approved for the rubric.

An LLM may help **summarize and phrase** the selected changes, but should not be the only mechanism deciding what is important.

### 8.3 Balanced patch coverage

The short summary should explain the patch **as a whole**, not only list who was nerfed.

When the patch contains meaningful changes in several categories, the system should try to cover the most important ones across:

- **hero buffs** — who became noticeably stronger and why;
- **hero nerfs** — who became noticeably weaker and why;
- **items** — important item buffs, nerfs, cost changes, recipe changes, or reworks;
- **global/gameplay changes** — map, economy, mechanics, systems;
- **critical fixes** — only when a bugfix materially affects normal games.

A good balance-patch summary will often look roughly like:

```text
⚡ Вышел патч 7.41f

Кого усилили:
— Hero A получил заметный бафф ...
— Hero B стал сильнее за счёт ...

Кого ослабили:
— Hero C получил пакет нерфов ...
— Hero D потерял ...

Что со шмотками:
— Item A стал дороже / слабее ...
— Item B заметно усилили ...

Короткая реакция ALEXEEV.

📖 Полный патч: <official link>
```

This is a **content principle, not a rigid quota**.

The system must not force one bullet from every category when that category has no meaningful changes. For example:

- if the patch is mostly item changes, items may dominate the post;
- if there are no meaningful hero buffs, do not invent a “buffed hero” section;
- if a major global mechanic changed, it may deserve the first bullet even if several heroes also changed.

The goal is to give the reader a fast, balanced answer to:

> Кто стал сильнее? Кто стал слабее? Что поменялось в предметах и самой игре?

### 8.3 Topic grouping

The short Telegram post should prefer **themes**, not raw lines from the patch notes.

Bad:

```text
— Daedalus +100 gold
— Dragon Lance +100 gold
— Heart +100 gold
```

Better:

```text
— Several popular late-game items became more expensive or weaker
```

Bad:

```text
— Shadow Fiend Necromastery changed
— Shadowraze changed
— Shadow Fiend talent changed
```

Better:

```text
— Shadow Fiend received a noticeable package of nerfs
```

### 8.4 Example: balance patch

For a patch with many changes, the final short summary should normally show several sides of the patch instead of focusing only on nerfs:

```text
⚡ Вышел патч 7.41f

🟢 Кого усилили:
— Anti-Mage получил заметный бафф Mana Break.

🔴 Кого ослабили:
— Shadow Fiend получил сразу несколько нерфов.
— Necrophos ослабили в нескольких ключевых местах.

🛡 Что со шмотками:
— Несколько популярных late-game предметов стали слабее или дороже.
— Satanic даёт меньше вампиризма, а часть дорогих предметов подорожала.

Valve опять двигает цифры туда-сюда.
Мы опять делаем вид, что теперь точно понимаем мету.

📖 Полный патч: <official link>
```

The exact facts in the final production post must always come from the detected official patch, not from this example.

### 8.5 Fallback when importance cannot be determined confidently

If the system cannot confidently rank the changes:

- do not invent a “top 3”;
- publish a more neutral short summary if that mode is approved;
- or require owner review if the update is too ambiguous.

The system should prefer an honest generic summary over a confident but arbitrary ranking.

## 9. Backend responsibilities

The backend should be able to:

1. Check approved official Dota 2/Valve sources.
2. Detect that a new patch/update/event appeared.
3. Determine whether the official announcement contains one or several independent content reasons (for example: gameplay patch + major event).
4. Extract the patch/update/event identifier.
5. Prevent duplicate processing of the same official content.
6. Fetch the official details.
7. Classify the content type.
8. For gameplay patches, select the most important confirmed changes.
9. For major events, extract a short answer to: what it is, what players do, and what the main rewards/content are.
10. Split a major event into a separate post instead of hiding it inside the patch summary.
11. Generate the Russian post draft according to the corresponding rubric.
12. Select the matching visual template.
13. Produce the final visual card.
14. Publish the card + text to the Telegram channel.
15. Save publication result and source URL.
16. Notify the owner only when intervention is needed.

## 10. Bot responsibilities

The Telegram bot is not the place where the owner manually sends patch information.

For this feature the bot mainly acts as:

- publication transport to the channel;
- owner alert channel when something fails;
- optional quick control point later.

Possible future controls:

- pause patch autopublishing;
- republish a failed safe publication;
- open the admin panel;
- view the last detected patch.

These controls are not required for the first implementation unless separately approved.

## 11. Failure handling

### 11.1 Source detected, but details unavailable

Do not invent a summary.

Possible behavior:

- wait briefly for the official details;
- or publish only a minimal confirmed alert if we explicitly approve that mode later.

### 11.2 Ambiguous update

Do not auto-publish.

Create an incident/alert for the owner.

### 11.3 Visual generation failed

Fallback:

- use the simplest gradient template;
- patch number;
- update type;
- short subtitle.

The post should still be publishable if the image renderer can safely fall back.

### 11.4 Telegram send result is uncertain

Do not automatically send the same post again if there is a risk of duplication.

The owner should be alerted for manual reconciliation.

## 12. Duplicate protection

The same Valve update must never create two separate channel posts by accident.

Deduplication should be based on a stable update identity, for example:

- official source URL;
- patch number/update ID;
- source publication identifier.

A modified official page should not automatically become a second post unless we later design an explicit correction/update workflow.

## 13. Owner alerts

The owner should **not** receive a message for every successful patch publication.

Alert only when useful, for example:

- official source cannot be parsed;
- update type cannot be determined;
- publication failed;
- send result is unknown;
- duplicate/conflict detected.

## 14. Analytics to store

For each patch publication, store enough data to evaluate the rubric later:

- update type;
- patch/update identifier;
- publication time;
- source URL;
- Telegram message ID;
- views after selected intervals when available;
- reactions when available;
- forwards/shares when available.

This allows us to compare major patches, balance patches, micro patches, and hotfixes later.

## 15. Initial visual templates

The first version should support at least four wide templates:

1. **Major patch**
   - large patch number;
   - red/orange high-impact background;
   - label such as `ОГРОМНЫЙ ПАТЧ`.

2. **Balance patch**
   - large patch number;
   - blue/purple or other distinct balance background;
   - label such as `БАЛАНСНЫЙ ПАТЧ`;
   - humorous subtitle allowed.

3. **Micro patch**
   - simpler background;
   - label `МИКРОПАТЧ` / `НЕБОЛЬШОЕ ОБНОВЛЕНИЕ`;
   - lighter joke.

4. **Hotfix**
   - red/orange urgent background;
   - `HOTFIX` / `ЭКСТРЕННЫЙ ФИКС`;
   - short bugfix-oriented subtitle.

Exact colors, typography, and final composition are a later design decision.

## 16. Open product decisions

These are intentionally **not approved yet**:

- Which exact Valve/Dota 2 URLs/endpoints are the canonical sources.
- Whether cosmetics/treasures/events use the same rubric or a different one.
- Whether a newly released hero should trigger a separate special template.
- Whether patch corrections get a second channel post.
- Maximum number of bullet points in a major patch.
- Exact humor rules and banned phrases.
- Exact image ratio and export resolution.
- Whether the bot should post a minimal alert before full notes are available.

## 17. MVP acceptance criteria

The patch automation feature can be considered functionally complete when:

- a new official patch can be detected automatically;
- the same patch cannot be published twice accidentally;
- the update is classified into an approved type;
- the generated text contains only confirmed information;
- the post contains the official source link;
- a wide visual card is generated from the correct template;
- if no art is available, the gradient/number fallback works;
- fake AI-generated Dota heroes are never required;
- the post can be published without owner confirmation;
- failed or ambiguous cases alert the owner instead of silently publishing bad information;
- an uncertain Telegram send is not automatically retried.

## 18. Out of scope for this document

This document does not define:

- general ALEXEEV channel content strategy;
- general news automation outside approved patch/update/event rubrics;
- quizzes;
- hero statistics;
- video/stream announcements;
- full admin panel UX;
- code architecture;
- implementation tasks;
- deployment.

Those should be planned separately after this patch rubric is approved.
