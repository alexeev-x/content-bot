# Area: backend rubrics — per-rubric implementation plan (31 rubrics)

Planning only (30.10.2026). Read: `docs/RUBRICS_SCHEDULER.md` (all), DECISIONS 30.10.2026, `architect-plan-v2.md` (+v2.1), the two reviews,
`release-model.md`, `research-*.md`, and the code: every builder in `apps/backend/src/modules/rubrics/`, `app/lab/rubric-samples.ts`,
`app/system-state.ts` (nextTurn), `integrations/{steam-public,valve-datafeed}`, `modules/{dota,game-files,ai}` signatures,
`design-refs/rubrics/*`, `.logs/handoff/rubrics/new/greeting_card/*`. Owner decisions are not relitigated. Where a decision cannot be
coded as written, it is listed in section 6 (conflicts) with the smallest fix, and in section 9 only if it needs the owner.

Scheduler core (slots, state machine, gate, notices, publishing, Cron) is other areas. This file is what each **rubric** must provide to
them and what changes inside `modules/rubrics/` and the few app/integration seams it touches.

---------------------------------------------------------------------------------------------------------------------------------

## 0. Numbering and keys

`RUBRIC_KEYS` has 30 keys (order = numbers 01–30 of the docs); `greeting_card` becomes 31. «Сеты из мастерской» = 11 (`workshop_set`),
«Гайд на героя» = 12 (`hero_guide`) — the docs give them no number, the cross-references (09 «not within 3 days of 11», 19 «stats: 10, 12, 20, 21, 29») fix it.

| # | key | # | key | # | key |
|---|---|---|---|---|---|
| 01 | patch_broken | 11 | workshop_set | 21 | forgotten_hero |
| 02 | who_is_imba | 12 | hero_guide | 22 | horoscope |
| 03 | nerf_or_buff | 13 | confess | 23 | hero_trial |
| 04 | whose_ability | 14 | explain_dumb | 24 | would_you_rather |
| 05 | files_dont_lie | 15 | toxic_translator | 25 | on_lane |
| 06 | who_gets_nerfed | 16 | ability_in_life | 26 | rebus |
| 07 | valve_seriously | 17 | hero_profile | 27 | toxic_bingo |
| 08 | valve_time | 18 | item_leaflet | 28 | fake_item |
| 09 | rate_it | 19 | tier_list | 29 | shame_of_day |
| 10 | who_beats_whom | 20 | recruit_picks | 30 | quote_of_day |
|    |  |    |  | 31 | greeting_card |

Adding the 31st key touches three places in one commit (skill `contract-change`): `modules/rubrics/samples.ts` (`RUBRIC_KEYS`, `RUBRIC_TITLES` «Открытка»,
`BUILDERS`), `apps/contracts/src/rubric-samples.ts` (`rubricSampleKeySchema` enum is a second copy of the list), `apps/frontend/src/features/rubric-samples/ui/RubricSamples.tsx`
(comment «All 30», list). `briefs.ts` is `Record<RubricKey, string>`: greeting_card gets `STANDARD` (ownText, never written).

---------------------------------------------------------------------------------------------------------------------------------

## 1. The shared layer every rubric needs (all in `modules/rubrics/`, pure, no D1, no fetch)

### 1.1 Why a layer
Today a builder is `(context) => RubricSample`, picks with `context.random` (`Math.random`) and reads its order from `sources.turns.next(name)`,
a **global counter in `system_state`** that every lab press and every failed build advances, and that reorders the whole bank when the bank grows.
`horoscope` and `shame_of_day` also **write** (`tellers.remember`, `shameHeroes.remember`) while building. None of that survives: D1 owns state (history of
posts + live slots), a build has no side effect, a lost build consumes no turn. The lab keeps working: it passes no `input` and the builders fall back to
today's behaviour (`sources.turns`, `Math.random`) — so the DEV sample page is unchanged (docs item 9).

### 1.2 New/changed types (`types.ts`)
```ts
export type Need = 'browser' | 'ai_text' | 'ai_image' | 'ai_upscale' | 'stratz' | 'stats_db';
export type Degradation =                     // typed; prod fails the candidate unless RUBRIC_META.allowDegrade lists it (H4)
  | 'PICTURE_DROPPED' | 'SLIDE_DROPPED' | 'FOLLOWUP_PICTURE_DROPPED' | 'ALBUM_PHOTO_DROPPED'
  | 'TEXT_TEMPLATE' | 'PHOTO_NOT_SHARPENED' | 'GUIDE_OPTIONAL_BLOCK';

export interface RubricFacts {                // stored as facts_json (Zod per key, `v:1`), see 1.6
  v: 1; heroIds: number[]; variant: string; look: string | null;
  bankKey: string | null; round: number | null; topics: string[];
  patchChain: string | null; onceKeys: string[]; extra: Record<string, unknown>;
}
export interface HistoryPost { rubric: RubricKey; slotAt: number; state: 'sent' | 'live'; facts: RubricFacts }
export interface RubricHistory {
  own: HistoryPost[];        // this rubric, newest first, sent ∪ live (ready/released/unknown count; send_failed/missed/empty do not), ≤ 2×bank+50 rows
  ownCount: number;          // COUNT(*) of the same set (the "turn")
  crossHeroes72h: number[];  // heroIds of every rubric's sent ∪ live post in the last 72 h (chain rubrics' own posts included)
  others: HistoryPost[];     // other rubrics' posts, last 3 days (topic / situation / mechanic cross rules)
}
export interface BuildInput {
  mode: 'prod' | 'rehearsal' | 'lab'; slotAt: number; seed: string;   // seed = `${slotId}:${attempt}` → seededRandom(seed)
  capabilities: ReadonlySet<Need>; history: RubricHistory;
  chain: PatchChain | null;                                           // PatchChain = { id, versions[], firstAt, latestAt, heroChanges }
  choice: InnerChoice;                                                // 1.4
}
export interface FollowUpSpec {               // replaces RubricSample.followUp for the scheduler (D1 slot per step)
  kind: 'hint' | 'answer' | 'result'; afterMinutes: number | null; waitFor?: 'next_patch';
  picture?: { html: string; width: number; height: number }; text: string; textWithWinner?: string; // `{winner}` placeholder
  conditional?: 'no_correct_guess';
}
export interface BuiltRubricPost extends RubricSample {
  facts: RubricFacts; degradations: Degradation[]; variant: string; followUps: FollowUpSpec[];
  pollClose: { afterHours: 24 | 168 } | null; pollOptionOrder: 'telegram_shuffle' | 'as_given_joke_last';
}
export const buildRubricPost: (key: RubricKey, context: RubricContext, input?: BuildInput) => Promise<BuiltRubricPost>;
```
`RubricContext` gains `rand: () => number` (seeded; `random` kept as alias for the lab). `RubricSources` gains four ports (app wires them, `rubric-build.ts`):
`patchText(version): Promise<{general: string[]; items: string[]}>` (from `modules/dota` `digestOfficialPatch`, 14/05 need general+item notes; `PatchNotes` today drops them),
`announcements(sinceMs)` (09: from `dota_update_items`: externalId=Steam gid, title, publishedAt, `draft_post_id` → our news post's `sent_at`),
`comments(postRef, sinceMs, untilMs)` (04, stage 7; null on DEV/before stage 7), `writer` (13/14/20 AI turns, see 1.9). `sources.turns/tellers/shameHeroes` stay for the lab only.

### 1.3 `RUBRIC_META` (`meta.ts`, the only thing the planner imports — never the banks)
```ts
interface RubricMeta {
  number: number; family: 'patch'|'stats'|'ai_scene'|'cosmetic'|'guess'|'text_bank'|'joke_poll'|'leak'|'picture_bank'|'calendar';
  weight: 'V' | 'L' | 'V_or_L';  interactive: boolean;
  trigger: 'chain' | 'event' | 'anchor' | 'pool' | 'calendar';
  needs: Need[]; needsByVariant?: Record<string, Need[]>;  allowDegrade: Degradation[];
  restDays: number | null;                    // CHECK 7..60 in D1; null = event/chain/calendar
  slot: 'day' | 'evening' | 'any' | 'weekend' | 'fri_evening' | 'fri_sat_evening' | 'anchor' | { fromMsk: string; toMsk: string };
  bank?: { exhaust: 'new_round' | 'pause' };  poll?: { kind: 'regular'|'quiz'; closeAfterHours: 24 | 168; inPicture: boolean; order: 'telegram_shuffle'|'joke_last' };
  silentAfterPatchDays?: 7;                   // 12, 19, 20, 21 (+06 bet, 10 real variant)
  heroGate: 'cross72h' | 'none';              // 'none' for chain rubrics 01,02,03,06,07 and text/bank rubrics with no hero fact
  sameDay: RubricKey[]; sameWeek?: RubricKey[]; apart?: { key: RubricKey; days: number }[];
  browserCalls: number; aiCalls: { text: number; image: number };   // ledger inputs (stage P), per post incl. follow-ups
  statusLabels: Array<'банк исчерпан'|'нужен Browser Rendering'|'нужен ИИ'|'нужен STRATZ'|'нужна база матчей'|'тихо после патча'|'ждёт картинок'>;
}
```
Table (docs win over `release-model.md` where they differ; only 12 differs: docs 9 days, ladder said 30):

| # | family | V/L | int. | trigger | needs (prod) | rest | slot (MSK) | bank exhaust | poll close | browser/ai calls |
|---|---|---|---|---|---|---|---|---|---|---|
| 01 | patch | V | – | chain D0 | browser, ai_text | – | day (12:30) | – | – | 1 / 1t |
| 02 | patch | V | ✓ | chain D1 (≥ evening after 01) | browser, ai_text | – | evening | – | 24 h | 1 / 1t |
| 03 | patch | V | ✓ | chain D3, ≥40 h after 02 poll | browser | – | day | – | 24 h (trap quiz 168 h), in picture | 1 / 0 |
| 04 | guess | V+V | ✓ | pool | browser | 14 | day, riddle ≤ 15:30 | – | – (comments) | 2 / 0 |
| 05 | leak | V | – | event Fri (finds ≤7 d) | browser, ai_text | 7 | fri_evening | – | – | 1 / 1t |
| 06 | patch | V+poll, V result | ✓ | event (bet ≥21 d after patch; result D2 of next patch) | browser, ai_text, stratz | – | weekday day / D2 day | – | 168 h | 1+1 / 1t+1t |
| 07 | patch | V_or_L | ✓ | chain D5 (D4–D6) | browser (picture variant), ai_text | – | evening | – | 24 h | 0–1 / 1t |
| 08 | patch | V | – | event (marks) | browser, ai_text | – | day | – | – | 1 / 1t |
| 09 | cosmetic | V | ✓ | event (announcement) | ai_text, ai_upscale | – | evening | – | 24 h | 0 / 1t(+1i upscale) |
| 10 | stats | V | – | pool | browser; real variant +stratz | 21 | evening | – | – | 1 / 0 |
| 11 | cosmetic | V (album) | – | pool | ai_text, ai_upscale | 21 | any | – | – | 0 / 1t |
| 12 | stats | V (carousel) | – | pool | browser, ai_text, stratz, stats_db | 9 | sat/sun pref | – | – | up to 3 / 1t |
| 13 | text_bank | L | – | pool | – (AI turn: ai_text) | 14 | any | new_round | – | 0 / 0–2t |
| 14 | text_bank | L | – | pool | – (AI turn: ai_text) | 21 | any | new_round | – | 0 / 0–2t |
| 15 | text_bank | L | – | pool | – | 14 | evening | new_round | – | 0 / 0 |
| 16 | joke_poll | L | ✓ | pool | – | 14 | day | new_round | 24 h, joke last | 0 / 0 |
| 17 | ai_scene | V | – | pool | browser, ai_image | 21 | fri/sat evening | new_round | – | 1 / 1i |
| 18 | text_bank | L | – | pool | – | 21 | any | new_round | – | 0 / 0 |
| 19 | stats | V | – | pool | browser, stratz | 30 | any | – | – | 1 / 0 |
| 20 | stats | V | – | pool | browser, ai_text, stratz | 30 | 18:00–19:00 | – | – | 1 / 2t |
| 21 | ai_scene+stats | V | – | pool | browser, ai_image, ai_text, stratz | 30 | any | – | – | 1 / 1t+1i |
| 22 | ai_scene | V | – | anchor Mon 08:00, every 2nd week | browser, ai_image | 14 | 08:00 exact | new_round (per form) | – | 1 / 1i |
| 23 | ai_scene | V | ✓ | pool | browser, ai_image | 21 | evening | new_round | 24 h | 1 / 1i |
| 24 | joke_poll | L | ✓ | pool | – | 14 | any | new_round | 24 h | 0 / 0 |
| 25 | guess | L | ✓ | pool | – | 14 | any | **pause** | 168 h | 0 / 0 |
| 26 | guess | V | ✓ | pool | browser | 30 | weekend | **pause** | 168 h, in picture | 1 / 0 |
| 27 | picture_bank | V | – | pool | browser | 21 | fri/sat evening | new_round | – | 1 / 0 |
| 28 | picture_bank | V | – | pool | browser | 21 | any | new_round | – | 1 / 0 |
| 29 | stats | V | – | pool | browser, stats_db | 7 | 08:00 exact | – | – | 1 / 0 |
| 30 | text_bank | L | – | pool | – | 7 | any | new_round | – | 0 / 0 |
| 31 | calendar+ai_scene family | V | – | calendar | browser | 30 (filler only) | card's own hour | – | – | 1 / 0 |

`sameDay` / `sameWeek` / `apart` (from docs, each pair stored on **both** sides; a data test checks symmetry):
03 apart 02 ≥40 h · 06 apart 08 3 d (both ways) · 08 apart 06 3 d · 09 apart 11 3 d, never same day as its news post · 11 apart 09 3 d · 13 sameWeek 24 ·
14 sameDay 18 · 15 sameDay 27 · 16 sameDay 24 · 17 sameDay {21,22,23,31} · 18 sameDay {14,28} · 19 sameDay {10,12,20,21,29} · 20 sameDay stats{10,12,19,21,29} ·
21 sameDay stats{10,12,19,20,29} + scene{17,22,23,31} · 22 sameDay scene{17,21,23,31}, never with 29 (Monday 08:00) · 23 sameDay scene{17,21,22,31} · 24 sameDay 16, sameWeek 13 ·
25 sameDay {04,26} · 26 sameDay {04,25} · 27 sameDay {15,19} · 28 sameDay 18 · 29 sameDay stats{10,12,19,20,21}, never a 22 Monday · 30 sameDay {13,14}.
`heroGate: 'cross72h'` for 10, 11 (via own-5), 12, 17, 20, 21, 22, 23, 29, 31; `'none'` for 01, 02, 03, 06, 07 (chain heroes follow their own rules), 04 (riddle hero is not named until the answer; own-5 rule only), 05, 08, 09, 13–16, 18, 19, 24–28, 30.

Files: `modules/rubrics/meta.ts` (+ `meta.test.ts`: 31 keys; rest ∈ 7..60; sameDay/apart symmetric; bank rubrics have `bank`; `needsByVariant` ⊆ Need; family sets match docs).

### 1.4 History-based picking instead of counters (`bank-pick.ts`, replaces the use of `bank-order.ts` in the scheduler path)
`InnerChoice` is the **pure** part of every inner rule: `chooseInner(key, {meta, history, chain, capabilities, seed, slotAt}) → InnerChoice | { skip: SkipReason }`
(`inner-rules.ts`, one small function per rubric, table-tested). `SkipReason` ∈ `BANK_EXHAUSTED | SILENT_AFTER_PATCH | NO_FITTING | NO_FRESH_FINDS | NOT_ENOUGH_GAMES | …`
= a **content skip**, never a failure/notice (docs «nothing to say is not a failure»).

Bank pick: `pickBankEntry({ keys, history.own, round rules, accept?: (key) => boolean, seed })`:
1. `round` = max `facts.round` in `own` (0 if none); `used` = bankKeys of that round (sent ∪ live). Failed/cancelled/missed slots are not in `own`, so a lost build consumes nothing.
2. `fresh` = keys never seen in loaded history (a bank that grew after a deploy → **new entries first**, docs «resumes with the new entries first»).
3. else the unused keys ordered by `fnv1a(round + ':' + key)` (stable under bank growth, unlike `shuffledOrder(round, size)[turn % size]` which reshuffles when `size` changes).
4. the first that passes `accept` (family rules: form ≠ last form, topic window, hero gate…). Skipped entries stay unused (not consumed).
5. nothing unused → `exhausted`: `meta.bank.exhaust === 'pause'` → rubric status «банк исчерпан», `skip BANK_EXHAUSTED`, no candidate until unused keys exist again (checked each plan from the generated index, 1.5);
   `'new_round'` → `round+1`, all keys unused, same call picks. Notice text (once per rubric+round, key `bank:<rubric>:<round>`, sent when the **last entry is projected as sent**, not at build):
   pause «Рубрика „Ребус“ закончила банк и поставлена на паузу. Пополните банк.»; new round «Рубрика „Переводчик с токсичного“ закончила банк и начала с начала. Если хотите — пополните банк, иначе будет по кругу.»
Heroes as the "bank" (17, 23 = 127 heroes; 22 tellers; 21, 20, 12 = live fitting sets): same helper with `keys` = live candidate hero ids; the round only advances when no fitting hero is left unused.
`bank-order.ts` stays for the lab (`turns`). `seededRandom(seed)` (mulberry32 over `sha256(seed)` first 4 bytes) in `seeded-random.ts` replaces `context.random` in the scheduler path; a retry of the same slot has a different seed (`attempt`) so a poisoned pick is not repeated.

### 1.5 Bank index (`bank-index.generated.ts`) — planner never loads banks
The planner/health step only needs per rubric: `size`, bank keys, per-entry `topics`, `form/kind`. A script (`apps/backend/scripts/gen-bank-index.ts`, `npm run rubrics:index`, same pattern as the existing `*.generated.ts`) imports the real banks
and writes `{ [rubric]: { keys: string[]; entries?: {key, form?, kind?, topics: string[]}[] } }`; a test fails when the file is stale. Bank keys: stable ids where they exist (`Mechanic.id`, `Entry.id` A01…, `LifePoll.id`, `Rebus.id`, `LaneQuiz.id`, `FakeItem.id`, `Suspect.hero`, anketa `hero`, `TierList.theme`), else
`fnv1a(first line)` computed by the builder file (13 `setup`, 18 `item`, 24 option 1, 30 quote text, 28 `id`). Each builder file exports `xxxBank()` returning `{ key, ... }[]`.
Rule: a bank entry's `key` never changes after it has gone out (editing a text keeps its id; renaming = new entry); test asserts keys unique per bank.

### 1.6 Facts envelope + the history columns this area needs from the data area (`0121 rubric_post_facts`)
Per post: `facts_json` (this section's per-rubric Zod, versioned) and promoted columns `bank_key`, `round`, `variant`, `look`, `topics_csv`, `hero_ids_json`, `sig_text`, `sig_lead`, `final_votes_json` (poll result kept after `stopPoll`).
Once-ever keys: `rubric_once_keys(rubric_key, once_key, slot_id, PRIMARY KEY(rubric_key, once_key))`, inserted in the **same batch as the guarded building→ready** (H3), deleted on yield/empty/cancel/supersede. Needed because 05 and 31 reserve several keys per post.
Cross-rubric reads are tiny (≤ ~12 rows for 3 days): the loader returns parsed facts and JS does the set logic; no child tables.

### 1.7 Lexical similarity (`similarity.ts`; semantic check deferred 4 weeks, owner 30.10.2026)
`signature(text)`: lowercase, strip punctuation/emoji, drop stop-words, 5-letter stems, word 3-shingles → FNV hash set capped at 64 values (`sig_text`); lead = first sentence/line 2-shingles (`sig_lead`).
`similar(a, b)` = Jaccard(text) ≥ `SIM_TEXT` (0.30) **or** Jaccard(lead) ≥ `SIM_LEAD` (0.50); window = last 20 own posts. Applied to every writer/AI-written output of 01, 02, 05, 06, 07, 08, 09, 11, 12, 21 and the AI turns of 13, 14, 20; for bank rubrics the exact-bank rule + topic window replaces it.
On a hit: one rewrite with the matched lines as «не повторяй» (writer port), still similar → per-rubric fallback (13: a bank line; others: the builder's own draft if `draftPublishable`, else the candidate fails `TOO_SIMILAR` and the slot goes to the next rubric; 05 and 21 drafts are raw material, not publishable).
Calibration (a test, not a guess): `similarity.test.ts` computes all pairwise scores inside each owner-approved bank (13, 15, 18, 30: hundreds of distinct approved jokes) and fails if the 99.5th percentile ≥ thresholds; first 14 days in prod log scores without blocking only if the owner asks (default: blocking from day one, thresholds as above, shown in the weekly report's failures line).

### 1.8 Topic vocabulary (`topics.ts`) — 13, 14, 18, 24, 25, 30 need «topic / mechanic» windows and none of the 800 bank entries is tagged
`topicsOf(text): Topic[]` — keyword/regex rules over normalised Russian: hero (by the 127 spoken names from `anketa.ts` → `hero:<key>`), role (`керри|мид|оффлейн|саппорт|пятёрк…`), `rank`, `teammates`, `mechanic:<tag>` (≈40 tags: `bkb`, `magic_immunity` (also on «БКБ»), `blink`, `stack`, `runes`, `glyph`, `buyback`, `roshan`, `tp`, `aegis`, `wards`…), situation (`слив`, `лив`, `тильт`, `пинг`, `мут`, `ранг`, `работа/школа/девушка`). Output is stored in the generated index; same-topic = non-empty intersection ignoring `other`.
Test `topics.test.ts`: every bank entry gets ≥ 1 topic (else tagged `other` and listed), the doc example pair intersects (14 «иммунитет к магии» ↔ 18 «БКБ»), 25's quiz refs (`values` item/ability keys) map to the same tags.

### 1.9 AI-turn writer port (13, 14, 20) — new, small
`RubricSources.writer?: { writeBankStyle(input): Promise<string | null>; factCheck(text, facts): Promise<string[]> }`, wired in `app/workflows/rubric-build.ts` to `modules/ai` (`generateCheckedDraft` / `checkFacts` already exist in `fact-check.ts`).
Input = brief + 6 same-kind bank examples (style only) + `avoid` (last 20 own texts' leads) + live facts. Output is **parsed back into the bank's structure** (13: `setup` + the two reaction lines; 14: only the comparison; 20: the five fields) — a text that doesn't parse is a failure of the AI turn → bank fallback (13, 14) / candidate fails (20). Numbers are never trusted to the model: placeholders `{games}`, `{value}` filled by code.
DEV rehearsal: `writer` absent → `AI turn → bank` (decision «bank rubrics with AI turns use the bank only»); the alternation state records the **actual** source, so a bank-instead turn does not skip the next AI turn.

### 1.10 Other shared pieces
- `src/shared/msk-time.ts` (pure; owned by the scheduler-core area — if not present when this starts, create it): `mskDayStart(utc)`, `mskDayIndex`, `mskWeekday`, `mskParts`, `mskDaysBetween(a,b)`. MSK = UTC+3 fixed. `modules/rubrics` may not import `modules/rubric-scheduler`, hence `shared/`. Replaces every `Date.UTC`/`/86_400_000` day maths in builders (shame_of_day, valve_time, files_dont_lie's `dayMonth`).
- `patch-chain.ts` (pure): `mergePatchChanges(perVersion: Change[][])` → per `(heroId, abilityId, stat)` first `from`, last `to`, recomputed `buff`/`size`, dropped when `from == to`; `PatchChain` type; used by 01, 02, 03, 07, 06 result. `latestPatch(context)` becomes `chainPatch(context, chain.versions)`; the lab passes `[latest.version]`.
- `valve-values.ts`: `readValues`/`ValueRef` extracted from `on-lane.ts` (also used by 14 for numbers read at build).
- `degradations` are produced where they happen: the render step in `rubric-build.ts` (PICTURE_DROPPED, SLIDE_DROPPED, FOLLOWUP_PICTURE_DROPPED, TEXT_TEMPLATE, ALBUM_PHOTO_DROPPED, PHOTO_NOT_SHARPENED) and 12's block failures (GUIDE_OPTIONAL_BLOCK); lab maps codes to the existing Russian notes. Only 07 (`PICTURE_DROPPED`) and 11 (`ALBUM_PHOTO_DROPPED` when ≥2 photos remain) and 12 (`GUIDE_OPTIONAL_BLOCK`) allow any.
- Poll order: `shuffle_options` is Telegram's per-voter shuffle (all polls today). 16 needs «joke last» ⇒ `pollOptionOrder: 'as_given_joke_last'` + publishing sends `shuffle_options:false`; the builder shuffles the three non-joke options with the seed and appends the joke. (publishing area: `PollSpec.shuffleOptions`).
- `withJoke(options, rand, jokes, avoid?: string[])`: picks a joke not in `avoid`; if the pool is exhausted by `avoid` it takes the least recently used (never blocks a post).
- Capability gate: `eligible(meta, variant, capabilities)`; unmet need → never a candidate, status label, no notice (H7). **DEV rehearsal capabilities = {browser}** (no ai_*, stratz, stats_db): candidates there are exactly 03, 04, 10 (joke variant only), 13, 14, 15, 16, 18, 24, 25, 26, 27, 28, 30, 31 (+ the event ones only when DEV happens to see the trigger: 03). Everything else shows its status label.

---------------------------------------------------------------------------------------------------------------------------------

## 2. Template of each rubric entry
trigger · META · facts · inner rules → code · builder changes · unavailable (DEV / prod) · bank exhaustion · tests · effort (S/M/L).
Facts always include the envelope of 1.2; only `heroIds`, `variant`, `look`, `bankKey`, `round`, `topics`, `patchChain`, `onceKeys` and `extra` are listed.
«cross72h» = the global 3-day hero gate (the builder receives `avoid.heroIds` and picks another; if none fits it returns `skip NO_FITTING`).

---------------------------------------------------------------------------------------------------------------------------------

## 3. Per-rubric plans — event / chain rubrics (01–09)

### 01 «Кого понерфили» — `patch_broken` (patch-rubrics.ts)
- **Trigger/META:** chain D0 (patch with hero changes, from `PatchChain` by the patch workflow), day slot, V, not interactive, needs browser+ai_text, rest –, heroGate none. effort M.
- **Facts:** `patchChain`, `onceKeys:['patch:<chainId>']`, `heroIds` (≤5, nerf order), `look` `painted|cut`, `extra.versions[]`, `extra.changes[]` (heroId, abilityId, stat — for 03's «not reused»).
- **Rules → code:**
  - one post per patch: `once_key` reserved at ready; trigger plans it only when no live/sent slot owns `patch:<chain>`;
  - hotfix ≤5 d joins: `chainPatch` merges all versions of the chain (first `from`, last `to`); built before release → numbers are the newest; patch version/`versions[]` in facts; gate re-checks chain version on release (H2) → a hotfix arriving while `ready` supersedes and rebuilds; arriving after `sent` does nothing;
  - fewer than 3 weakened → `skip NO_FITTING` (today `noData('nerfed heroes')` → mapped to a skip, no notice). Re-evaluated on a hotfix (event key includes chain version count);
  - not reused by 03 of the same patch: nothing here, 03 reads these `heroIds`; portrait backgrounds: `painted = rand() < 0.5` (seeded) — owner: stays random.
- **Builder changes:** `latestPatch`→`chainPatch`; `context.random`→`context.rand`; returns facts; text stays the draft the writer retells (`draftPublishable: true`).
- **Unavailable:** DEV — not a candidate (ai_text, owner decision). Prod without browser/AI → label, not candidate; AI failure in tick → candidate fails `AI_TEXT_FAILED` (TEXT_TEMPLATE not allowed), slot to next.
- **Tests:** `patch-chain.test.ts` (shared): hotfix changes net, flip-flop to equal drops; `inner-rules` table: <3 → skip, 3 → build.

### 02 «Кто теперь имба?» — `who_is_imba`
- **Trigger/META:** chain D1 evening (the evening after 01) — **independent of 01's status** (goes out when 01 was skipped if ≥2 stronger); V, interactive (24 h poll, final votes kept), needs browser+ai_text. effort M.
- **Facts:** `heroIds` (≤6, order), `extra.jokeOption`, `extra.versions`, `onceKeys:['patch:<chain>']`.
- **Rules → code:** `<2` stronger → `skip NO_FITTING`; hotfix merge as 01; joke option may repeat only after 4 later posts → `avoid` = last 4 `extra.jokeOption` into `withJoke` (pool 9 → always satisfiable); poll `closeAfterHours:24`, `stopPoll` result stored in `final_votes_json` (scheduler area); heroes for 03: this `heroIds` recorded.
- **Builder changes:** same as 01; `IMBA_LOOK` constant stays `'B'` (the `'A'` branch is dead code but the owner chose B; no change, not my task).
- **Unavailable / tests:** as 01; table test for the joke window (4) incl. pool exhausted.

### 03 «Нерф или баф?» — `nerf_or_buff`
- **Trigger/META:** chain D3 day slot, ≥40 h after 02's poll (scheduler `apart`), V, interactive, needs **browser** only (poll with the picture inside; no AI), `poll: {regular|quiz, 24 h | 168 h, inPicture}`. effort M.
- **Facts:** `heroIds:[hero]`, `variant: 'mixed'|'trap'`, `look: 'A'|'C'`, `extra.jokeOption`, `extra.changeKey` (hero+ability+stat), `onceKeys:['patch:<chain>']`.
- **Rules → code:**
  - hero not one of 01/02's: `avoid.heroIds = chain heroes of 01 ∪ 02` (from `others`/`own` by chain); the pool is filtered first; if the filter empties a non-empty pool, use the unfiltered pool («when another fits»);
  - mixed hero preferred; no mixed hero → trap (cost/cooldown/cast time went down) — `variant: 'trap'`; no trap → `skip NO_FITTING` («no trap — no post»); trap whose ability is unknown (no icon, `html === null`) is dropped from candidates (it would need the AI writer);
  - look never twice in a row: `look != own[0].facts.look` (two looks, so alternation);
  - joke option after 6 later posts: pool `DONT_BOTHER_JOKES` has **5** → impossible as written (conflict C4): the pool needs ≥7 entries; until then the `withJoke` fallback takes the least recently used;
  - quiz trap closes after 168 h, mixed poll after 24 h.
- **Builder changes:** `pick(NERF_LOOKS)`→`choice.look`; `mixed`/`traps` filtered by `avoid`; `chainPatch`; one post per patch via once key.
- **Unavailable:** DEV candidate **only if** the patch trigger exists on DEV (needs browser only). Prod without browser → label.
- **Tests:** hero-avoid fallback; look alternation; joke window with pool < window.

### 04 «Чья способность?» — `whose_ability`
- **Trigger/META:** pool, rest 14, **day slot and riddle ≤ 15:30 MSK** (answer 3 h later must precede the evening slot: `answerBeforeEvening`), family guess, V+V, interactive, needs browser (2 renders, 11 s apart inside the build), browserCalls 2. effort L.
- **Facts:** `heroIds:[hero]`, `extra.abilityId`, `extra.abilityKey`, `extra.level:'easy'|'medium'|'hard'`, `look:'A'|'B'|'E'`, `extra.answerNames[]` (localizedName + `spokenHeroName`, for comment matching), `extra.postRef` (message id after send, added by projection).
- **Rules → code:**
  - rest 14, answer same day: `RUBRIC_META.slot` + `latestStartMsk = '15:30'` consumed by the planner; `ANSWER_AFTER_MINUTES = 180` kept;
  - ability not in the last 20 riddles, hero not in the last 5: `avoid.abilityIds` (20), `avoid.heroIds` (5, own posts); builder draws **up to 8 random heroes** not in the avoid-5 (seeded), reads `heroDetail` one at a time until an ability of the level (ultimate with cooldown / basic with cooldown) not in avoid-20 is found; none → `skip NO_FITTING` (today: picks one random hero first and fails with `noData` if it has no suitable ability);
  - look never twice in a row: `look != last.look` (3 looks); pair keeps one look (existing `WHOSE_PAIRS`);
  - difficulty in turn Лёгкий → Средний → Тяжёлый: `level = LEVELS[(index(last.level)+1) % 3]` (today `pick(LEVELS)` random: conflict C2);
  - `unknown` riddle holds its answer for the owner: follow-up `answer` slot depends on the parent `sent` (scheduler `waiting_parent`; unknown ⇒ not released, owner reconciles) — the builder only emits `followUps`;
  - **comment reading** (stages 1/4/7): builder emits `followUps = [hint (afterMinutes 90, conditional 'no_correct_guess'), answer (180, picture, text, textWithWinner)]`. `comment-guess.ts` (pure): `namesHero(commentText, answerNames)` = normalised token/stem equality (≥3 letters; «Котл» matches via `spokenHeroName`), first match by comment time wins; the release step of `answer` asks `comments(postRef, T, T+180min)`; found → `textWithWinner.replace('{winner}', '@'+username)` (a bank `ANSWER_WINNER_CAPTIONS`, ≥10 lines, owner-style, to write), none → plain `ANSWER_CAPTIONS`; `hint` text = «Подсказка: основной атрибут — сила/ловкость/интеллект/универсал» or role from `HeroInfo.roles`; **posted only if the audience feed exists and no comment names the hero**; without audience data (DEV, before stage 7) no hint is posted and the answer is plain. A comment mentioning a hero in a negation («не Пудж») counts as naming (owner's rule as written); 
  - first guesser's `@username` is shown only when the commenter has one; else «Первым угадал один из вас» (no id/name leaks, ingest area owns the field).
- **Builder changes:** the seeded random, avoid lists, level by turn, followUps (replace `followUp`), keep `ownText: true`.
- **Unavailable:** DEV candidate (browser only; no comments ⇒ plain answer). Datafeed down → candidate fails (source error, classified), next rubric.
- **Tests:** level rotation, ability/hero windows incl. fewer than 8 usable heroes, `namesHero` table («Котл», «Пудж», other hero, empty), latest-start rule (data), hint only when feed available.

### 05 «Утечка недели» — `files_dont_lie` (content-rubrics.ts)
- **Trigger/META:** Friday evening (weekly, rest 7, `slot: 'fri_evening'`), V, not interactive, needs browser+ai_text; no finds in 7 d ⇒ the slot goes to another rubric, **no notice**. effort L.
- **Facts:** `extra.finds[{sha, sig}]`, `onceKeys: ['find:<sha>'…]`, `look`, `extra.eggs[2]`, `extra.builds[]`.
- **Rules → code:**
  - window `[slotAt−7 d, slotAt]` on `committedAt` (not rolling-`now` from `Date.now`);
  - a find shown once never again, even if a new build carries it: (a) exact — `once_key find:<sha>` per find (`gameFinds` must return `sha`; `GameFind` has it, the `RubricSources` shape drops it: add), (b) content — `find-identity.ts`: `contentTokens(find)` = numbers + Latin/Capitalised names of the find text/note; `sameFind(a,b)` = Jaccard(3-shingles of content tokens) ≥ 0.5 vs `extra.finds[].sig` of the last 60 finds; matched finds are dropped; none left ⇒ `skip NO_FRESH_FINDS`;
  - patch week (a chain with `firstAt` within 7 d of the slot): finds already in the patch are dropped: `findInPatch` = ≥70% of the find's content tokens appear in `patchText(version)` (general + items + heroes notes, all chain versions); all dropped ⇒ `skip NO_FRESH_FINDS`;
  - look never twice in a row (3 looks; 2 when ≤2 cases — `A`,`C` only: alternation inside the allowed set);
  - easter eggs repeat only after 4 later posts: `shuffled(LEAK_EGGS)` filtered by the eggs of the last 4 posts (2 each ⇒ 8 excluded; pool ~60–100);
  - AI picks one detail (existing brief); output goes through lexical similarity vs last 20 (`TOO_SIMILAR` ⇒ one rewrite ⇒ fail, no template: the draft is a dump).
- **Builder changes:** `RubricSources.gameFinds` returns `sha`; `since` from `input.slotAt`; filters above; `dayMonth` in MSK; facts.
- **Unavailable:** DEV not a candidate (ai_text). Prod: no finds ⇒ skip; GitHub tracker down (stored finds only) ⇒ uses `game_file_builds`.
- **Tests:** `find-identity.test.ts` fixtures (same find in a later build with other wording → dropped; two different finds → kept), patch-week filter, egg window, 7-day window edge at MSK midnight.

### 06 «Кого понерфят?» — `who_gets_nerfed` (stats-rubrics.ts, + `bet.ts`, `nerf-pictures.ts`)
- **Trigger/META:** event; bet due ≥21 d after the latest patch and before the next, weekday day slot, no open bet / unpublished result (D1 partial UNIQUE, area data); result on D2 of the new patch after 01; V + poll (168 h); needs browser, ai_text, stratz; `silentAfterPatchDays: 7`; `apart` 08 ±3 d. effort L.
- **Facts (bet post):** `heroIds[≤5]`, `extra.winRates[]`, `look 'A'|'B'`, `extra.form:'picture'|'text'`, `extra.patchAtBet`, `extra.options[]`, `extra.jokeOption`; (bet row in `rubric_bets`: post id, hero ids, patch version, poll id, `resolved_at`).
- **Rules → code:**
  - bet builder = `whoGetsNerfed` split: `buildBet(context, input)` returns the question only (picture + text + poll); **the follow-up built inside the sample is dropped** from the scheduler path (today it is composed from the *current* patch at question time);
  - `buildBetResult(context, bet, votes, patchVersions | 'timeout')` new: outcomes via `patchOutcomes` over the chain's merged changes, vote shares from the stored `final_votes_json` (`stopPoll` at resolve): one line «62% ставили на <hero>» for the top-voted hero **only when total votes ≥ 10** (assumption), result picture with the **same look**, `form` kept (`picture` bet → picture result, `text` bet → text result);
  - resolve trigger (workflow): newer patch with hero changes ⇒ conditional claim `UPDATE … WHERE resolved_at IS NULL` ⇒ `stopPoll` ⇒ result slot on D2 (after 01); a patch with no hero changes leaves the bet open; 60 days after `posted_at` without a patch ⇒ result «Два месяца прошло, патча нет — Valve, как обычно, похуй» (`nerfResultPicture` gets a `timeout` mode: all heroes «не тронули», label «ПАТЧА НЕТ»); the bet closes only when the **result is published**;
  - bet not within 3 d of 08 (`apart`); poll closes after 168 h, final votes kept (needed by the result);
  - heroes do not repeat the previous bet; if the same are still strongest, ≥2 new: `bet.ts: chooseBetHeroes(candidates sorted by winRate, previousIds)` — take top 5; if `|top5 \ prev| < 2` replace the lowest-ranked previous members with the best non-previous until 2 are new; fewer than 2 non-previous candidates ⇒ `skip NO_FITTING`; fewer than 3 candidates in total ⇒ skip (today `<3 → noData`);
  - look A/B: `look` random today; stays random per bet (no owner rule), seeded; the result reads `facts.look`.
- **Builder changes:** split into `buildBet`/`buildBetResult`; export `chooseBetHeroes`, `voteLine`; `nerf-pictures.ts` gets the `timeout` mode and the share line; remove `context.random` use for options.
- **Unavailable:** DEV not a candidate (stratz+ai). Prod: STRATZ bridge down ⇒ candidate fails; a **result** whose slot fails keeps the bet open and is re-planned inside its freshness window (D2 ± 2 d); after the window it is posted late only as a text result (assumption: the 2-month text exists anyway).
- **Tests:** `bet.test.ts` (new-heroes rule table, vote line threshold/rounding), result form follows bet form, timeout text, claim race belongs to the data area.

### 07 «Valve, ты серьёзно?» — `valve_seriously`
- **Trigger/META:** chain D5 (window D4–D6), evening, V_or_L, interactive (24 h), needs browser only for the picture variant + ai_text; `allowDegrade:['PICTURE_DROPPED']`. effort M.
- **Facts:** `heroIds` (≤3), `extra.setIndex`, `extra.pictured: boolean`, `onceKeys:['patch:<chain>']`.
- **Rules → code:** variant `text|picture` comes from the scheduler (`choice.variant`: patch week ⇒ text; later ⇒ picture unless two picture posts just before — planner's rule R5); one change per hero, ≤3, ≤6% size (existing); heroes not from 01–03 of that patch **when other tiny changes exist** (filter, then unfiltered fallback); hotfix's tiny changes join (chain merge); joke option **set** repeats only after 6 later posts: `SERIOUSLY_SETS` (15) minus the last 6 sets' `extra.setIndex`; poll 24 h; one post per patch.
- **Builder changes:** `chainPatch`; `choice.variant==='text'` ⇒ `picture:null, noPicture:true` (no scene drawn); set choice from history.
- **Unavailable:** text variant needs only ai_text; DEV not a candidate (ai_text).
- **Tests:** set window; hero-avoid fallback; variant text has no picture.

### 08 «Валв-тайм» — `valve_time`
- **Trigger/META:** event, due on the MSK day a mark is reached: 30, 45, 60, 90 d, then every 30; each mark once per patch (`onceKeys:['mark:<latestVersion>:<mark>']`); **any** patch (even without hero changes) resets the count; day slot; V; needs browser+ai_text; apart 06 ±3 d. effort S.
- **Facts:** `extra.mark`, `extra.days`, `extra.version`, `look 'A'|'C'`, `extra.jokeIndex`.
- **Rules → code:** `days = mskDaysBetween(patchDate, slotDay)` (today `Math.floor((now−ts)/86_400_000)` in UTC); the mark list `marksReached(days)`; «moved at most 2 days for a patch/heavy day, never later»: the planner may shift the slot **up to 2 MSK days earlier**, never later; the picture shows the **actual count at posting** (28–30), see open question Q4; look never twice in a row (`look != last.look`); a mark's joke repeats only after all that mark's jokes went out: new `VALVE_TIME_JOKES: Record<mark, string[]>` replacing `joke(days)` (today 1 line per range, and **every mark ≥ 90 says «Три месяца»**: conflict C8) — marks > 90 get months from `Math.round(mark/30)`; the bank picker rotates inside the mark's own list (bank size 1 ⇒ trivially «all went out»); the writer's caption stays one short line (existing brief).
- **Builder changes:** MSK days; `jokes by mark`; `look` from choice; `noData('<30 days')` ⇒ `skip NOT_DUE`.
- **Unavailable:** DEV not a candidate; no extra data needed beyond `patches()`.
- **Tests:** `marksReached` around MSK midnight (UTC 21:00–24:00 vs MSK day), reset by a no-hero patch, mark once per patch.

### 09 «Оцениваем» — `rate_it`
- **Trigger/META:** event: a Valve announcement of the last 21 d with a novelty (existing `NOVELTY`/`NOT_NOVELTY` regexes) not yet rated; evening, 1–5 d after **our news post** about it, never the same day; V, interactive (24 h), needs ai_text + ai_upscale (`improvePhoto` for narrow photos); apart 11 ±3 d. effort M.
- **Facts:** `onceKeys:['announcement:<gid>']`, `extra.gid`, `extra.title`, `extra.optionsSig`, `extra.jokeOption`.
- **Rules → code:** announcements come from D1 (`announcements` port over `dota_update_items`, `event_type in ('treasure','news')`, `published_at ≥ now−21d`) joined to `draft_post_id`→ the news post's `sent_at` (**gid today is not in `steamNews()`**: `newsSchema` lacks `gid` ⇒ add it in `integrations/steam-public`; the builder matches live `imageUrl` by gid); eligibility: `sent_at` + 1..5 MSK days and not the same MSK day; **no news post exists** (owner hid it / AI skipped) ⇒ fall back to `publishedAt + 1..5 d` (assumption, Q9); several ⇒ newest first, others wait, ≥7 d between posts of this rubric (`restDays:7` for the event family); poll options never the same twice in a row (`RATE_JOKES` 15, `withJoke(avoid:[last joke])`); poll 24 h.
- **Builder changes:** pass the chosen announcement (`choice.gid`) instead of `find(first match)`; facts; `withJoke` avoid.
- **Unavailable:** DEV not a candidate (ai_text/upscale). Announcement without image ⇒ not eligible (existing).
- **Tests:** eligibility window table (1–5 d, same-day, no news post), newest-first with 7-day spacing, once key.

---------------------------------------------------------------------------------------------------------------------------------

## 4. Per-rubric plans — pool rubrics (10–30)

### 10 «Кто кого перебьёт?» — `who_beats_whom` (stats-rubrics.ts, versus-pictures.ts)
- **Trigger/META:** pool, rest 21, evening, V, not interactive, needs browser; `needsByVariant: { real: ['stratz'] }`; `silent` only for the real variant. effort M.
- **Facts:** `heroIds[2]`, `extra.pair:'min-max'`, `variant:'real'|'joke'`, `extra.jokeKind`, `look 'B'|'D'`, `extra.title` (index).
- **Rules → code:** variant **strictly in turn** (`variant = last==='real' ? 'joke' : 'real'`; today `random() < 0.5`: C3); 7 days after a patch with hero changes only `joke` (forced; the owed `real` comes next since alternation reads the actual last); jokeKind never twice in a row (5 kinds; `role_swap`/`poor_support` use `heroLateItems` ⇒ excluded when `stratz` is not a capability, so DEV rehearsal runs `hero_meme|beggar_rich|absurd` only); look `B|D` alternate; title not in the last 4 (5 titles); pair `a-b` not in the last 20 posts, each hero not in the last 5 posts (own history); `heroGate cross72h`.
- **Builder changes:** `versusSides(context, …, choice)`; carries/supports pools filtered by `avoid.heroIds` and `avoid.pairs`; no `random()` coin.
- **Unavailable:** DEV: joke variant with non-STRATZ kinds. Prod STRATZ down: real variant fails ⇒ candidate fails (not silently turned into a joke, the owed real stays owed).
- **Tests:** variant alternation incl. the forced-joke week, joke-kind/look/title windows, pair window.

### 11 «Сеты из мастерской» — `workshop_set` (content-rubrics.ts)
- **Trigger/META:** pool, rest 21, any slot, V (album), needs ai_text + ai_upscale, `allowDegrade:['ALBUM_PHOTO_DROPPED']` when ≥2 photos remain (H4); apart 09 ±3 d. effort M.
- **Facts:** `onceKeys:['workshop:<id>']`, `extra.workshopId`, `heroIds` (0/1 from tags), `extra.verdictIndex`.
- **Rules → code:** never repeats **ever**: iterate `workshopTrendingIds()` in trend order, skip any id with a once key (`workshop-pick.ts: firstUnused(ids, usedIds)`); the highest-trending unused of the top ten; none ⇒ `skip NO_FRESH_SET` («no new set — no post»); the set's hero not within the last 5 own posts; a set Valve already announced as an item is not taken: lexical containment of the normalised set title in `announcements` (titles + excerpts, 60 days) and in 09's `extra.title`; hero verdict (Pudge) remains `rand() < 0.5` seeded.
- **Builder changes:** `pick(ids)`→ ordered iteration (≤5 `workshopItem` fetches); facts; `workshopVerdict` takes `rand`.
- **Unavailable:** DEV not a candidate. Workshop HTML change (`workshopTrendingIds` empty) ⇒ source error classified, next rubric.
- **Tests:** `workshop-pick.test.ts` (never repeats, skips announced, hero window), album with exactly 1 photo is a failure, ≥2 allowed.

### 12 «Гайд на героя» — `hero_guide` (stats-rubrics.ts, guide-data.ts, guide-pictures.ts)
- **Trigger/META:** pool, rest **9** (owner: «хотя бы раз в 8–9 дней»), Saturday/Sunday preferred (`slot: 'weekend'` preference), V carousel (≤3 renders, 11 s apart), needs browser, ai_text, stratz, stats_db; `silentAfterPatchDays:7`; heroGate cross72h; `allowDegrade:['GUIDE_OPTIONAL_BLOCK']`. effort L.
- **Facts:** `heroIds:[hero]`, `extra.position`, `extra.games`, `extra.round`, `bankKey:'<heroId>:<position>'`.
- **Rules → code:**
  - pool = heroes with ≥150 base games at some position in the 14-day window (`HeroMatchSource.games(hero, pos).length ≥ BASE_MIN_GAMES`), not the top-30 by Divine pick rate (`GUIDE_POPULAR`) as today (C11); **a hero is not repeated until every fitting hero has had a guide**, then a new round with **another role where possible** (round keys are `hero:position`; a hero's new-round candidate prefers an unused position);
  - role: main position (`mainPositions`) first; a second position only if ≥150 base games **and** ≥15% of the hero's games there (`secondaryPositions`), never a joke role; no forced quota;
  - pick among unused fitting heroes: random of the 5 highest pick-rate (seeded) — assumption (Q8); hero not in another rubric's post of the last 3 days (`avoid`), silent 7 d after a patch with hero changes (planner), Sat/Sun preference (planner);
  - too few games for the chosen role ⇒ **next hero**, never a guide with guessed items: in the scheduler path the STRATZ winners-only sample fallback (`sample` when `games < 150`) is removed ⇒ candidate rejected `NOT_ENOUGH_GAMES`; the lab keeps the fallback;
  - core build must come from matches; `Предметы — суммы по предметам` / OpenDota items fallback are **not** allowed (guessed items); optional blocks (talents, neutrals, matchups, win by length, alternative, late) may be missing ⇒ `GUIDE_OPTIONAL_BLOCK`.
- **Builder changes:** `heroGuide(context, input)` takes `choice.heroId/position` (selection moves out into `chooseGuideHero(candidates, history)`, pure, tested); `notes[]` → `degradations`; STRATZ calls stay one at a time with the existing gap; heavy CPU (150-match sample) stays inside the consumer.
- **Unavailable:** DEV not a candidate (stats_db, stratz, ai_text). Prod STRATZ down ⇒ fails (core needs `positions()`).
- **Tests:** round/role logic (`chooseGuideHero`), 15% second-role rule, ≥150 gate, no fallback fills the build, silent window is planner's.

### 13 «Признавайтесь» — `confess` (fun-rubrics.ts)
- **Trigger/META:** pool, rest 14, any slot, text (L), needs none (AI turn: ai_text), `bank.exhaust: new_round`; sameWeek 24. effort M.
- **Facts:** `bankKey` (hash of `setup` for bank turns; `ai:<hash>` for AI), `variant:'bank|ai'`, `extra.kind:'confession'|'hot_take'`, `topics`, `round`, `extra.setup` (≤200 chars, for similarity windows).
- **Rules → code:** source alternates bank/AI by the **actual** last source; kind pattern 2 of 3: `kind = ['confession','confession','hot_take'][ownCount % 3]`; hot takes (16 entries) run out first ⇒ per-kind rounds (kind pool = bank filtered by kind, `round` tracked per kind); a bank line never repeats until the whole bank has gone out (1.4); **AI text vs all earlier posts** (similarity 1.7): similar ⇒ one rewrite ⇒ still similar ⇒ **a bank line instead** (variant recorded `bank`); topic (hero/role/situation) not within the last 10 posts: `accept` rejects entries whose topics intersect the last 10 posts' `topics` (AI texts: topics extracted from the output with `topicsOf`, similar rule ⇒ rewrite); not the same week as 24 (planner `sameWeek`); the «different emoji pair if they meet» clause is **moot** (24 is a poll now, no emoji pair): not implemented, noted in C13.
- **Builder changes:** `confess(context, input)`; bank = `CONFESS_BANK` with keys; AI path via `writer` port parsing `setup + 2 reaction lines` (hot take lines fixed `По факту — 👍` / `Хуйня — 💩`); `turns.next` only in lab.
- **Unavailable:** DEV/AI down ⇒ bank only (decision). Never fails for AI reasons.
- **Tests:** kind pattern; source alternation after a fallback; topic window; AI text parse/similarity fallback (fake writer).

### 14 «Объясни как дебилу» — `explain_dumb`
- **Trigger/META:** pool, rest 21, any slot, text (L), `bank.exhaust: new_round`; sameDay 18; apart 25 (mechanic 14 d). effort L.
- **Facts:** `bankKey` (mechanic id), `variant:'bank'|'ai'|'now_so'`, `extra.comparison` (0–2 or `ai:<hash>`), `topics` (`mechanic:<tag>`), `round`.
- **Rules → code:**
  - mechanic order via 1.4; **comparison never repeated**: bank turn takes `comparisons[usesOf(mechanic) % 3]` where `usesOf` counts the mechanic's earlier posts in history (today `round % 3`); AI turn writes a **new** comparison (so it is never a repeat; parsed back, similarity vs the mechanic's earlier comparisons); bank/AI in turn;
  - numbers read from the game files at build: entries whose number lives in Valve data get `values: Record<string, ValueRef>` and `{name}` placeholders in `rule` (reuse `valve-values.ts` from 25); the audit of the 100 entries is part of this task (list produced in the PR; entries with no source stay `handNumbers: true`);
  - hand-number mechanics (runes, glyph, buyback…) carry `watch: RegExp`; after a patch whose **general or item notes** (`patchText`) match, the entry is `accept=false` until the owner rechecks (`rubric_overrides` row `recheck:<id>`, cleared in «Рубрики»); the list goes to the owner once per patch (bot message «Пропущены до проверки: …»); `patchText` general notes come from `digestOfficialPatch` (`PatchNotes` has none) ⇒ Q10;
  - a mechanic changed by a patch may go out of turn as «теперь так» (`variant:'now_so'`, `choice.forceKey`; the planner calls it once per changed mechanic within 14 d, text prefix from the AI turn or the bank rule + «Теперь так: …» computed from the new numbers) — only for mechanics with `values` refs (numbers known);
  - not the same day as 18 (planner), topic cross rule with 18/25 via tags (14 d).
- **Builder changes:** `explainDumb(context, input)`, `Mechanic` type gets `tags?`, `values?`, `watch?`, `handNumbers?`; generated index carries tags.
- **Unavailable:** DEV/AI down ⇒ bank only; datafeed down ⇒ entries with `values` are skipped for this build (others remain).
- **Tests:** comparison rotation by per-mechanic uses, skip-after-patch + recheck, `now_so` once per patch, numbers filled from fake `itemValues`.

### 15 «Переводчик с токсичного» — `toxic_translator`
- **Trigger/META:** pool, rest 14, evening, text (L, rich), `new_round`; sameDay 27. effort S.
- **Facts:** `bankKey` (A01…), `extra.form:'A'|'B'|'C'` (dictionary / «как сказать» / three ranks), `extra.phrases[]` (the quoted phrases), `round`.
- **Rules → code:** order by 1.4 (shuffled, none repeated); `accept`: form ≠ last form (skip-ahead inside the round order, skipped entries stay unused); **no phrase shared with 27**: `accept` rejects entries whose `phrases` appear in 27's `extra.cells/themes` of the last 60 days (assumption on the window, Q-assumption A4); same-day exclusion is the planner's.
- **Builder changes:** keys from `Entry.id`; phrases extracted at index time (`«…»` in line 1); no `turns.next`.
- **Unavailable:** none (no AI/browser/STRATZ).
- **Tests:** form-never-twice incl. round boundary; phrase overlap data report (a test that *lists* overlaps between 15 and 27 banks; fails on > 0 only after the owner asks for disjoint banks).

### 16 «Способность в жизнь» — `ability_in_life`
- **Trigger/META:** pool, rest 14, day slot, L (bare poll, 24 h), `new_round`, `poll.order: 'joke_last'`; sameDay 24. effort S.
- **Facts:** `bankKey` (`D01`/`C…`/`A5`), `extra.kind:'scene'|'catch'|'kit'` (by membership in `LIFE_SCENES/CATCHES/KITS`), `round`.
- **Rules → code:** order by 1.4; kind never twice in a row (`accept`); options shuffled with seeded shuffle, joke appended last, Telegram per-voter shuffle **off** (C13: today `shuffle_options:true` would move the joke); poll closes after 24 h, votes kept.
- **Builder changes:** `abilityInLife(context, input)` returns `pollOptionOrder: 'as_given_joke_last'`.
- **Unavailable:** none. **Tests:** kind alternation; joke last in the final array (builder); publishing test for `shuffle_options:false` belongs to publishing area.

### 17 «Анкета» — `hero_profile` (anketa.ts)
- **Trigger/META:** pool, rest 21, Fri/Sat evening, V (AI scene), needs browser + ai_image; heroGate cross72h; sameDay scene family. effort S.
- **Facts:** `heroIds:[id]`, `bankKey` (hero key), `round`.
- **Rules → code:** every hero once in a shuffled order before any repeat (1.4; round = hero keys, 127); hero not in another rubric's post of the last 3 days (`accept` via `avoid.heroIds`, skipped entries stay unused); never without its picture: a failed scene ⇒ candidate fails `SCENE_FAILED` (builder already throws `sceneFailed` in the lab; in `rubric-build` it is a build failure, not `PICTURE_DROPPED`, and **the hero stays unused**); not same day as another AI scene (planner).
- **Builder changes:** `heroProfile(context, input)`; hero key→id via `sources.heroes()`.
- **Unavailable:** DEV not a candidate. Prod image provider down ⇒ breaker, other rubric.
- **Tests:** round coverage with the 3-day avoid; failed scene leaves the hero unused.

### 18 «Инструкция по применению» — `item_leaflet`
- **Trigger/META:** pool, rest 21, any slot, text (L, rich), `new_round`; sameDay 14, 28. effort S.
- **Facts:** `bankKey` (item key hash), `topics` (item tag + `mechanic:<tag>`), `round`.
- **Rules → code:** order by 1.4; **no skip after a patch** (owner «это забей»: no `watch`); topic not within 2 weeks of the same topic in 14: `accept` rejects entries whose topics intersect 14's `topics` of the last 14 days (`others`); numbers stay hand-written as approved (28.10).
- **Builder changes:** keys; `leaflet.topics` in the index; `itemLeaflet(context, input)`.
- **Unavailable:** none. **Tests:** 14↔18 topic exclusion with the doc example.

### 19 «Тир-лист» — `tier_list` (tier-list.ts)
- **Trigger/META:** pool, rest 30, any, V, needs browser + stratz, `silentAfterPatchDays:7`, sameDay stats family. effort M.
- **Facts:** `look` (`best|easy|ranks|length|worst|swing`), `extra.bracket`, `round`.
- **Rules → code:** six looks **strictly in turn**: `look = LOOKS[(index(last.look)+1) % 6]` (today `turn % LOOKS.length` over a global counter); rank of best/worst/ranks-low side **in a circle**, never twice in a row: `bracket = ROTATION[(index(last.bracket)+1) % 5]` (today `pick(ROTATION, random)`: C14); a look that fails tries **the next look in turn**, capped at 3 looks and **stopped at once on a source failure** (`STRATZ_TOKEN|BLOCKED|RATE`, 5xx, timeout — the code comment records that falling through all looks got the bot address refused); all looks fail ⇒ candidate fails, the slot goes to another rubric; a look that failed for *data* keeps its turn (it is next time's first).
- **Builder changes:** `tierList(context, input)` with `lookOrder`; `rankLook/ranksLook` take `bracket`.
- **Unavailable:** DEV not a candidate. **Tests:** look order with skipped look; bracket circle; source failure stops the walk.

### 20 «Что брать рекруту» — `recruit_picks` (recruit-picks.ts)
- **Trigger/META:** pool, rest 30, **18:00–19:00 MSK** window, V, needs browser + ai_text + stratz, `silentAfterPatchDays:7`, heroGate cross72h (especially 12), sameDay stats family. effort L.
- **Facts:** `heroIds:[id]`, `extra.winRate`, `extra.games` (the «N из 100»), `extra.first: boolean`, `round`.
- **Rules → code (doc: AI-written, today `ownText`, hand-written bank):**
  - candidates = **top ten** of the week on Рекрут by win rate (`≥500` games), not today's top 30 (`RECRUIT_TOP`: C15), **any** top-ten hero (not only the 43 with bank posts); a hero is not repeated until every fitting hero (those that were in the top ten when picked, tracked by `round` keys) has had a turn, so «not only the perennial first»;
  - AI text = bank posts of the same hero (else two of the same role) as **style examples** + `heroDetail` abilities of the current patch + live win rate (`{games}` placeholder replaced by code) + slang lexicon (the writer's `matchLexicon`) ⇒ `writer.factCheck` ⇒ one rewrite ⇒ still failing ⇒ candidate fails `FACT_CHECK_FAILED` (slot to another rubric); the five-field structure is parsed back; picture = existing `cardPage` from live numbers;
  - similarity vs last 20 (1.7);
  - hero not in another rubric's post of the last 3 days; silent 7 d after a patch with hero changes (planner); not same day as another stats rubric (planner).
- **Builder changes:** `recruitPicks(context, input)` + `RECRUIT_BRIEF` in `briefs.ts`; the bank stays as examples; `ownText` stays true (the text is final once checked).
- **Unavailable:** DEV not a candidate. Prod AI/STRATZ down ⇒ candidate fails.
- **Tests:** top-ten/round selection with churn in the top ten; placeholder replacement; fake-writer fact-check failure ⇒ fail.

### 21 «Забытый герой» — `forgotten_hero` (forgotten-hero.ts)
- **Trigger/META:** pool, rest 30, V (AI scene) + ai_text for the caption, needs browser, ai_image, ai_text, stratz; silent 7 d; heroGate cross72h; sameDay stats + scene families. effort M.
- **Facts:** `heroIds:[id]` (+crowd hero for «Два героя»), `variant:'rare'|'over'`, `look` (`Записка|Разыскивается|Два героя|Найден герой`), `extra.verdict`, `round`.
- **Rules → code:** fitting = rare pick (< `RARE_PICK`) with win rate above `RARE_WIN`; **not repeated until every fitting hero has had a turn** (rounds over the live fitting set); the hero must **still be rare at posting time**: rates are read at build and re-read at release only for the pick rate of the chosen hero (one STRATZ call) — else `skip` and next hero; today `pick(top5)` ⇒ ordered by unused first; `OVER_SHARE` random coin ⇒ every 4th own post is the mirror (`ownCount % 4 === 3`, assumption: doc is silent, owner chose «one in four»); look picked by `rand` (`Два героя` only for `бери`) with no owner rule; never without picture (as 17); silent after patch.
- **Builder changes:** `forgottenHero(context, input)`, rounds, mirror rule; `draft` text is raw (`draftPublishable:false`).
- **Unavailable:** DEV not a candidate. **Tests:** round with a shrinking fitting set; mirror cadence; picture-failure leaves hero unused.

### 22 «Гороскоп» — `horoscope` (horoscope.ts)
- **Trigger/META:** anchor Monday 08:00 MSK every other week (parity anchored at first activation; a skipped Monday is **not** retried the next week); V (AI scene), needs browser + ai_image; sameDay scene family; never with 29. effort M.
- **Facts:** `variant:form 'А|Б|В|Г'`, `bankKey` (`Г99`…), `extra.tellerId`, `extra.ballId`, `extra.way:'enemy'|'riser'|'random'`, `heroIds:[tellerId, ballId]`, `round` (per form).
- **Rules → code:** forms in turn `FORM_TURN = А,Б,А,В,А,Г` by `ownCount`; inside a form the bank is shuffled without repeats (1.4, rounds per form); **a new teller each time, none repeated before every hero has read** (today `system_state` tellers, written *during build*): teller = unused hero from `own.facts.tellerId` of the current teller round, round advances when all 127 have read; ball never shows the teller; **ball hero not within the last 10 horoscopes** (`avoid.ballIds` from 10 own posts), teller and ball not in another rubric's post of the last 3 days (`avoid.heroIds`, cross72h); ball `way` coin ⇒ seeded; `riser`/`enemy` need STRATZ ⇒ when `stratz` isn't a capability or fails, `random` (existing fallback; not a failure); no picture ⇒ the post is skipped and **waits for the next turn** (two weeks later, no catch-up): `SCENE_FAILED` marks the slot `empty` with `skip_until_next_anchor`.
- **Builder changes:** `horoscope(context, input)`; drop `tellers.remember`; teller/ball selection pure `chooseTeller`.
- **Unavailable:** DEV not a candidate. **Tests:** teller round coverage and 10-window; form cycle; scene failure skips without retrying next week (scheduler test with a fake builder).

### 23 «Подозреваемый» — `hero_trial` (suspect.ts)
- **Trigger/META:** pool, rest 21, evening, V (AI scene + poll 24 h), needs browser + ai_image; heroGate cross72h; sameDay scene family. effort S.
- **Facts:** `heroIds:[id]`, `bankKey` (hero key), `extra.verdictsSig`, `round`, `extra.caseNo` (= `ownCount + 1`, replaces `(turn ?? 0) + 1`).
- **Rules → code:** each of the 127 heroes once in a random order before any repeats (1.4); verdict options never the same twice in a row: `accept` rejects an entry whose `verdictsSig` equals the last post's (each suspect has its own four verdicts — a data test asserts all 127 sets differ, so the rule is satisfied by data and protected by a test); options shuffled by seed; poll 24 h; never without picture (as 17).
- **Builder changes:** `suspect(context, input)`; `shuffled(chosen.verdicts, rand)`.
- **Unavailable:** DEV not a candidate. **Tests:** `suspect-data.test.ts` (127 unique heroes, unique verdict sets), round coverage.

### 24 «Что выберешь?» — `would_you_rather`
- **Trigger/META:** pool, rest 14, any, L (poll 24 h), `new_round`; sameDay 16, sameWeek 13. effort S.
- **Facts:** `bankKey` (hash of option 1), `topics`, `extra.topic` (punishment topic: `rank|teammates|life|…` via `topicsOf`), `round`.
- **Rules → code:** order by 1.4; options shuffled (seeded; Telegram shuffle stays on); poll 24 h; **punishment topic not within the last 5 posts** (`accept`); bank of 79 (asserted by test; grep sees 76 — the test settles it).
- **Builder changes:** keys; `RATHER_BANK` becomes `{key, options}`; `wouldYouRather(context, input)`.
- **Unavailable:** none. **Tests:** topic window; bank-count assertion.

### 25 «Ты на линии» — `on_lane` (on-lane.ts)
- **Trigger/META:** pool, rest 14, any (fine right after a patch: numbers are live), L (quiz, 168 h), `bank.exhaust: pause` (a solved quiz may not repeat; assumption A3: «26 Ребус и ему подобные»); sameDay 04, 26; apart 14 (same mechanic, 14 d). effort M.
- **Facts:** `bankKey` (quiz id), `topics` (from `values` refs → `mechanic:<tag>`), `extra.deferred[]` (ids that failed this build), `round`.
- **Rules → code:** order by 1.4; **up to 3 tries when one fails** — tries are the next *unused* keys, not `turn+attempt` slots (today `at = turn + attempt` skips ahead and consumes later entries; a deferred quiz is never marked used); a failed quiz (`у Valve нет X`, text over limits) is recorded in `extra.deferred` ⇒ the owner is told once per quiz id per patch («Вопрос „hook“ отложен: … — после патча его надо переписать»); one mechanic not more often than once in 2 weeks together with 14 (tags, `others` window 14 d); not the same day as 04 or 26 (planner); explanation/option limits (300/100/200) checked as today.
- **Builder changes:** `readValues` → `valve-values.ts`; `onLane(context, input)` loops unused keys; `notes` → `extra.deferred` + owner notice via `degradations`-like `contentNotices` (not a failure).
- **Unavailable:** none (Valve datafeed only); datafeed down ⇒ candidate fails (source error).
- **Tests:** 3-try walk leaves deferred unused; pause when the last quiz went out; mechanic window vs 14.

### 26 «Ребус» — `rebus` (rebus.ts)
- **Trigger/META:** pool, rest 30, weekend, V (quiz in the picture, 168 h), `bank.exhaust: pause`, sameDay 04, 25. effort S.
- **Facts:** `bankKey` (`Rebus.id`), `extra.optionsOrder`, `round`.
- **Rules → code:** order by 1.4; options shuffled by seed (correct index recomputed after shuffle); never without picture (render failure ⇒ candidate fails, the rebus stays unused); when the bank is exhausted ⇒ **pause + owner message** (1.4) and status «банк исчерпан»; resumes by itself when a deploy adds entries (new keys first).
- **Builder changes:** `rebus(context, input)`; `REBUSES` keys unchanged.
- **Unavailable:** DEV candidate (browser only). **Tests:** pause/resume with a grown bank (shared bank-pick test).

### 27 «Токсик-бинго» — `toxic_bingo` (toxic-bingo.ts)
- **Trigger/META:** pool, rest 21, Fri/Sat evening, V, needs browser, `new_round` (owner told), sameDay 15, 19. effort M.
- **Facts:** `variant:'bingo'|'tier'`, `bankKey` (tier theme hash | `bingo:<cardNo>`), `extra.cells[]` (bingo cell keys) / `extra.theme`, `extra.phrases[]`, `round`.
- **Rules → code:** variant strictly in turn (`variant = last==='bingo' ? 'tier' : 'bingo'`; today `turn % 2` over the global counter); a **card** = a bingo card (10 chat + 14 game cells drawn from unused cells of the current cell round, seeded; skipping a cell repeated inside the card as `drawn()` does today) or a tier list (theme bank, 20): none repeated until all have gone out, then a new round with the owner told; **no situation shared with 15**: cells/themes whose `phrases` appear in 15's posts of the last 60 days are dropped (A4); not same day as 15 or 19 (planner); never without picture; rich `caption` reactions rotate by `variant`.
- **Builder changes:** `bingo(card)`/`tierList(card)` take chosen cells/theme; keys for cells (hash) and themes.
- **Unavailable:** DEV candidate (browser). **Tests:** variant alternation; cell rounds with bank growth; overlap with 15.

### 28 «Предмет, которого нет» — `fake_item`
- **Trigger/META:** pool, rest 21, any, V, needs browser (icons are static: `FAKE_ITEM_ICONS`, dynamic import), `new_round`, sameDay 18. effort S.
- **Facts:** `bankKey` (`FakeItem.id`, 40), `round`.
- **Rules → code:** the 40 items by 1.4; all gone ⇒ new round with the owner told; not same day as 18 (planner); never without picture (render failure ⇒ candidate fails, item unused); a missing icon is a data bug ⇒ build failure `ICON_MISSING` (notice via the normal failure path) and a test asserts every item has an icon.
- **Builder changes:** `fakeItem(context, input)`.
- **Unavailable:** DEV candidate. **Tests:** `fake-item-data.test.ts` (40 ids unique, icon for each).

### 29 «Пидорок дня» — `shame_of_day` (shame-of-day.ts)
- **Trigger/META:** pool, rest 7, **08:00 MSK** exact, V, needs browser + stats_db, silent: none; heroGate cross72h; sameDay stats family; never a horoscope Monday. effort M.
- **Facts:** `heroIds:[id]`, `variant:'score'|'build'`, `extra.position`, `extra.dayMatches`, `extra.mskDay`.
- **Rules → code:**
  - **«yesterday» is the Moscow day** — today `until = floor(now/DAY_MS)*DAY_MS` (UTC midnight): C1. Fix: `until = mskDayStart(slotAt)`, `since = until − 1 day` (so at 08:00 MSK the whole previous MSK day is complete);
  - hero not within its last 3 posts: `avoid.heroIds` from own 3 posts (replaces `system_state.shame_heroes` and its `remember` side effect in the build) **and** not in another rubric's post of the last 3 days (cross72h);
  - too few games yesterday (collector stalled) ⇒ no post, slot to another rubric: `skip COLLECTOR_STALLED` when `dayMatches < max(100, 0.5 × median of the previous 6 MSK days' counts)` (thresholds are an assumption, Q-assumption A5; both numbers are constants and the weekly report shows the skip); the builder gets `dayMatches` from `worstGames` (both reads) so no extra query; 
  - first variant in turn: `variant = last==='score' ? 'build' : 'score'` (today `turn % 2`), the other as fallback when the first finds nothing (existing loop);
  - not same day as another stats rubric (planner); never without picture.
- **Builder changes:** `shameOfDay(context, input)`: `since/until` from MSK helpers, `recent` from history, no `remember`.
- **Unavailable:** DEV not a candidate (stats_db). Prod stats DB down ⇒ candidate fails.
- **Tests (extend `shame-of-day.test.ts`):** MSK day window at 20:59/21:00 UTC and at the UTC midnight, hero window from history (no remember), stalled-day skip table.

### 30 «Цитата дня» — `quote_of_day` (quote-of-day.ts)
- **Trigger/META:** pool, rest 7, any, text (L), `new_round`, sameDay 13, 14. effort S.
- **Facts:** `bankKey` (hash of quote text), `topics` (`teammates|rank|hero:<key>` via `topicsOf` + the author), `extra.reactions` index, `round`.
- **Rules → code:** order by 1.4 over the 300 (assert count in a test; grep sees 287 single-line entries); topic not within the last 5 posts (`accept`); reactions rotate by `ownCount % 3` (was `turn % 3`); not same day as 13/14 (planner).
- **Builder changes:** `quoteOfDay(context, input)`; quote entries get keys.
- **Unavailable:** none. **Tests:** topic window; reactions cycle.

### 31 «Открытка» — `greeting_card` (new: `greeting-card.ts`, `greeting-cards.ts`, `calendar-rules.ts`)
- **Trigger/META:** calendar (item 8b): on its date at the card's own hour; `weekday:*` and `any` cards fill empty slots (rest 30 d); the `patch` card only for a major patch `^\d+\.\d{2}$` (7.xx, no letter); each card once a year; the four `02-14` cards by `year % 4` over their file order; V; needs browser (code text over a static background + the hero's Valve render(s)), no AI; family scene (same-day with 17/21/22/23); `statusLabels:['ждёт картинок']` until the owner's backgrounds are in. effort L.
- **Data:** `greeting-cards.ts` (typed from `.logs/handoff/rubrics/new/greeting_card/bank.json`: 70 cards: 37 fixed, 12 `rule:`, 13 weekday, 7 `any`, 1 patch; fields `id, date, occasion, hero (null|key|[key,key]), wish, background`) + `hour?: 'HH:MM'` (new; default 11:00, Q5) + `approved: boolean` (only approved cards are candidates; the bank is a living draft). Backgrounds (6: roses, kittens, coffee, glitter, nature, champagne) are owner-made 3:2 images stored as R2 static objects `static/greeting/<name>.jpg`; the build fetches the one needed and embeds it (data URL), crops to 1536×768 in CSS.
- **Facts:** `onceKeys:['card:<id>:<year>']`, `heroIds` (0–2), `bankKey:id`, `extra.year`, `extra.background`.
- **Rules → code:** `calendar-rules.ts` (pure): `resolveDate(rule, year)` for `MM-DD`, `weekday:*`, `any`, `patch`, `rule:<n>-<dow>-<MM>`, `rule:last-<dow>-<MM>`, `rule:maslenitsa` (Orthodox Easter by the Julian computus +13 d, −55…−49 d), `rule:day-256`, `rule:world-sleep-day` (Friday 13–19 March, flagged UNVERIFIED by the owner notes), `rule:black-friday`; the day card's slot = its date at its hour (anchor ⇒ other rubrics fit around it; **a missed day is skipped**, docs «a calendar post whose day has passed is skipped»); two cards on one day ⇒ the one with `hero:null` big holiday first, the other skipped (assumption); weekday/any fillers: rest 30 d between filler cards, picked by unused-first (1.4, keys = card ids of kind weekday/any, 20, new round when exhausted, owner told); the patch card trigger from `PatchChain` (major only) at the planner's hour; hero not within the last 3 days of another rubric for fillers (cross72h; **not** for a day card — its day is fixed); no picture (backgrounds missing) ⇒ skip, never text-only.
- **Builder changes:** new builder; `RUBRIC_TITLES.greeting_card = 'Открытка'`; contracts + frontend list (section 0).
- **Unavailable:** DEV candidate (browser; backgrounds in DEV R2 uploaded by script — `--remote` is the owner's).
- **Tests:** `calendar-rules.test.ts` (Easter 2026/2027, maslenitsa 2026-02-16…22, 2027-03-08…14, `last-sun-08`, `black-friday` 2026-11-27, day-256 leap year, `year % 4` pick for 14.02, patch regexp), once-per-year key, filler rest.

---------------------------------------------------------------------------------------------------------------------------------

## 5. App/integration seams touched by the rubric work (files)
New in `modules/rubrics/`: `meta.ts`, `bank-pick.ts`, `inner-rules.ts`, `seeded-random.ts`, `similarity.ts`, `topics.ts`, `patch-chain.ts`, `valve-values.ts`, `find-identity.ts`, `bet.ts`, `comment-guess.ts`, `workshop-pick.ts`, `calendar-rules.ts`, `greeting-card.ts`, `greeting-cards.ts`, `bank-index.generated.ts`; script `apps/backend/scripts/gen-bank-index.ts` (+ npm script).
Changed in `modules/rubrics/`: `types.ts`, `samples.ts`, `index.ts`, `briefs.ts`, `patch-rubrics.ts`, `game-rubrics.ts`, `content-rubrics.ts`, `stats-rubrics.ts`, `fun-rubrics.ts`, `anketa.ts`, `forgotten-hero.ts`, `horoscope.ts`, `suspect.ts`, `on-lane.ts`, `rebus.ts`, `toxic-bingo.ts`, `fake-item.ts`, `shame-of-day.ts`, `quote-of-day.ts`, `tier-list.ts`, `recruit-picks.ts`, `nerf-pictures.ts` (timeout mode, share line), `valve-time-pictures.ts` (jokes by mark, months), `guide-data.ts` (no change planned beyond exports).
Outside: `src/shared/msk-time.ts` (shared), `integrations/steam-public/steam-public.ts` (`gid` in `newsSchema`/`dotaNews`), `app/workflows/rubric-build.ts` (wires `patchText`, `announcements`, `comments`, `writer`; maps lab notes→degradations; **does not** pass `turns/tellers/shameHeroes`), `app/lab/rubric-samples.ts` (lab path unchanged; imports the renamed builder), `apps/contracts/src/rubric-samples.ts` + `apps/frontend/.../RubricSamples.tsx` (31st key), `modules/ai` (writer entry for 13/14/20 + `RECRUIT_BRIEF`; owned by the AI part of the stage).
Needed from the data area (not written here): `rubric_post_facts` columns of 1.6, `rubric_once_keys`, `rubric_bets` (06), `rubric_overrides` (14 recheck list; or `rubric_settings.json`), `final_votes_json`.
Docs after implementation: `docs/RUBRICS_SCHEDULER.md` marks per-rubric «built»; `docs/backend/` topic file for rubric history/facts (docs only what exists).

## 6. Conflicts between the owner's rules and the current code (each has a fix above)
| # | rule | code today | fix |
|---|---|---|---|
| C1 | 29: yesterday = Moscow day | `Math.floor(now/DAY_MS)` UTC midnight (`shame-of-day.ts:890`); heroes kept in `system_state` and written during build | MSK window, history for heroes, no side effect |
| C2 | 04: difficulty in turn; hero ≤5, ability ≤20 windows; look not twice | `pick(LEVELS)`, `pick(heroes)`, `pick(WHOSE_LOOKS)` random; hero picked before it is known to have an ultimate | choice from history; up to 8 heroes probed |
| C3 | 10: real/joke strictly in turn; joke kind, look, title windows; pair/hero windows | `random() < 0.5`, `pick(JOKE_KINDS)`, `pick(VERSUS_LOOKS)`, `pick(VERSUS_TITLES)`; `role_swap/poor_support` need STRATZ | alternation + windows; kinds filtered by capability |
| C4 | 03: joke option repeats only after 6 posts | `DONT_BOTHER_JOKES` has **5** — a 6-post window cannot hold | owner content: ≥7 entries (Q3); fallback = least recently used |
| C5 | 01/02/03/07: one post per patch, hotfix ≤5 d joins | `latestPatch` = newest version only; 03/07 would build on a different version than 01 | `PatchChain` merge |
| C6 | 06: result with vote shares, same look, bet's form, 2-month text | follow-up built at question time from the *current* patch, no votes, no timeout, no form | `buildBetResult`, `nerf-pictures` timeout mode |
| C7 | 05: a find once shown never again; eggs after 4; look not twice | rolling `now − 7 d`, no find identity (`RubricSources.gameFinds` drops `sha`), random eggs/look | once keys + `find-identity` + windows |
| C8 | 08: marks, MSK day, a mark's jokes rotate, look not twice | UTC `floor`, `joke(days)` says «Три месяца» for **every** day ≥ 90, random look | marks function, jokes by mark, months for > 90 |
| C9 | 09: once per announcement (Steam id); 1–5 d after our news post | `steamNews()` has no id, first match wins, no link to the news post | `gid` + `announcements` port |
| C10 | 11: set never repeats | `pick(ids)` random from the top ten | once keys + ordered iteration |
| C11 | 12: rounds over every hero, second role ≥150 games & ≥15%, never guessed items | top-30 random; main position only; falls back to STRATZ winners-only sample below 150 games | `chooseGuideHero`, no fallback in scheduler path |
| C12 | banks: no repeats until all gone; new entries first; 13/14/20 AI turns; 14 numbers from files | `turns.next` global counter in `system_state` (lab presses and failed builds consume it; bank growth reshuffles); AI turns do not exist; 14 numbers hand-written | history picker, writer port, `values` refs |
| C13 | 16: «joke last»; 13: «different emoji pair with 24» | lab sends every poll with `shuffle_options:true`; 24 is a poll (no emoji pair) | `as_given_joke_last` + publishing flag; clause moot |
| C14 | 19: failed look tries the next; ranks in a circle | code comment forbids falling through (STRATZ refused the bot's address); `pick(ROTATION, random)` | capped walk, stops on source failure; circle |
| C15 | 20: AI-written, fact-checked; top ten | `ownText` hand-written bank; `RECRUIT_TOP = 30`; random pick | AI path + fact check; top ten; rounds |
| C16 | 21: rounds; still rare at posting; 7-day silence | `pick(top5)` random, 25% mirror by coin | rounds, cadence, silence |
| C17 | 22: ball ≠ last 10; tellers per round; forms in turn | tellers in `system_state` written during build; forms by global counter | facts history |
| C18 | 25: up to 3 tries; deferred quiz not consumed | `at = turn + attempt` consumes later slots | unused-key walk |
| C19 | 27: variant in turn; cards unrepeated; no overlap with 15 | `turn % 2` global; cells straddle rounds; no overlap check | history + overlap filter |
| C20 | all: deterministic, retry-safe builds | `Math.random` via `container.random`; lab `turns` side effects | `seededRandom(slot:attempt)`; scheduler path never touches `turns` |
| C21 | 31 | not built; contracts/frontend know 30 keys | section 4 §31, section 0 |
| C22 | 14: skip hand-number mechanics after a patch that changed them | `PatchNotes` has heroes only; `digestOfficialPatch` general notes exist in `modules/dota` but not in rubric sources | `patchText` port (Q10) |

## 7. Tests (only where a bug posts the wrong thing or repeats a post — skill `testing`; table-driven, one file per pure unit, no per-rubric snapshot)
`meta.test.ts` (data invariants, symmetry, rest bounds) · `bank-pick.test.ts` (round, used/live, new-first, bank growth, accept skip-ahead stays unused, pause vs new_round, determinism by seed, lost build consumes nothing) ·
`inner-rules.test.ts` (one table per rule family: alternation 10/13/15/16/19/27/29, difficulty 04, jokes windows 02/03/07/09/08, topic windows 13/24/30/14↔18/25, look-not-twice) ·
`patch-chain.test.ts` · `bet.test.ts` · `find-identity.test.ts` · `comment-guess.test.ts` · `workshop-pick.test.ts` · `calendar-rules.test.ts` · `similarity.test.ts` (+ bank calibration) · `topics.test.ts` ·
extended `shame-of-day.test.ts` (MSK) · data tests: `suspect-data`, `fake-item-data`, `bank-index-fresh`, bank keys unique, 15↔27 overlap report ·
Worker-level (scheduler areas own them, rubric builders appear as fakes): scene failure ⇒ hero/entry stays unused; once-key reservation released on yield; second post of 04 waits for parent.
Not tested: pictures, copy, bank wording, CSS, look choices beyond alternation.

## 8. Risks
1. **Lexical similarity thresholds** are guesses until real data; mitigations: bank calibration test, weekly-report failure line, thresholds are constants; semantic check is deferred by the owner. Too strict ⇒ many `TOO_SIMILAR` skips for writer rubrics.
2. **Find identity (05)** is heuristic (content tokens); a re-announced find with different words may repeat once; a different find sharing tokens may be dropped. Fixtures from real builds needed before go-live.
3. **14's `watch` regexes** depend on general patch notes that the rubric sources do not carry today (Q10); until wired, every hand-number mechanic would have to be blocked for 7 days after each patch (fallback if the owner prefers certainty).
4. **STRATZ bridge** is one request at a time with gaps; 12/19/20/21/06/10 builds are slow (minutes) and run in the Queue consumer; a build that exceeds its slot deadline is `NOT_BUILT_IN_TIME` (build_at = slot−3 h gives room, but two stats rubrics are never planned the same day anyway).
5. **Browser daily cap on prod:** 04 (2 renders), 12 (up to 3), 06 (1+1) use the most; `browserCalls` is exact input for the ledger; the 11 s gap is inside the build (wall time, not CPU).
6. **Bank growth after deploy** changes `fresh` sets: covered; **renaming or deleting an entry** whose key is in history leaves a dangling key (ignored; test warns).
7. **13/14/20 AI turns** are new behaviour with new failure modes (unparseable output, fact check); each has a deterministic bank/candidate fallback, so none can block a slot.
8. **31 depends on owner-made pictures and hours**; shipping the key with `approved:false` for all cards makes it a no-op, not an error.
9. **Hotfix definition (Q2)** decides whether 01–03/07 post twice for a patch family.
10. Adding fields to the Zod facts requires `v` bumps; loader drops (and logs) rows that fail validation instead of throwing, so one bad row never stops a rubric — but a dropped row also loses its rest/round contribution (health line counts them).

## 9. Open owner questions (recommendation first; none blocks the plan, defaults are coded)
- **Q1 «ждёт владельца»:** comment text kept 7 days (counts and summaries kept). 04's first-guesser needs the text for only 3 h after the riddle, so 7 days suffices; no change to rubrics either way.
- **Q2 hotfix:** «a hotfix within 5 days joins the same post». Rec.: patch family = `^\d+\.\d+` + letters; versions of one family within 5 days of the family's first version belong to one chain; a letter version with hero changes **after** 5 days starts a new chain (own 01–03/07). OK?
- **Q3 03 jokes:** add ≥2 more «не еби мозги» options (7 total) so «after 6 posts» holds; until then the least recently used repeats.
- **Q4 08 moved earlier:** the post may move ≤2 days **earlier**; rec.: the picture shows the real day count (28–30) instead of the mark; alternative: skip the mark when its day is blocked.
- **Q5 31 hours:** each card's hour (owner: «в каждой будет время»); rec.: default 11:00 MSK for day cards, 00:05 only if the owner wants midnight on 01.01; list to fill in `greeting-cards.ts`.
- **Q8 12 pick:** among unused fitting heroes rec.: random of the 5 highest pick-rate (popular guides first), later optionally «most named in comments».
- **Q9 09 without a news post:** rec.: count 1–5 days from the announcement's own date.
- **Q10 14 recheck:** rec.: wire general patch notes (`patchText`) and block `handNumbers` entries whose `watch` matches; the owner gets one list per patch and clears entries in «Рубрики».
Assumptions made where the docs are silent (all constants, easy to change): A1 vote line only with ≥10 votes (06); A2 21's mirror every 4th post; A3 25 pauses like 26 (known answer once out); A4 15↔27 overlap window 60 days; A5 29 stalled-day threshold `< max(100, 0.5 × 6-day median)`; A6 two cards on one date: the big holiday goes, the other is skipped.
