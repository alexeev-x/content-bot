# AI editor architecture: status and plan

Answer to the owner's review `sources/ALEXEEV_AI_EDITOR_ARCHITECTURE_REVIEW.md` (16.10.2026). The review's target holds: «AI writes from a small relevant context, keeps the owner's edits, links the final text to the video's result, draws careful conclusions within the same format and adds to memory only confirmed rules». The review is accepted as the readiness checklist; nothing below is built unless marked **built**.

Legend: **built** (in code, tested), **designed** (in docs/ai or docs/PLAN.md, not in code), **missing**.

## Readiness checklist

| # | Item | Status | Where / how | Check | Adds |
|---|---|---|---|---|---|
| 1 | Baselines within one format | **missing** — the usual curve is per platform only (`content-analytics/service.ts` `baselineFor(rows, platform)`); items have no format | Add `format` (`fidit`, `igrat`, `standalone`, `telegram`, `unknown`) to content items: set by the owner in the item panel or proposed by the cheap model from the title, confirmed by the owner. Baseline key `platform + format + checkpoint`; fallbacks: neighbouring checkpoint → platform baseline marked «слабое сравнение» | An «Учусь играть» video is never compared with БКБ/варды/драфт; test with mixed items | one cheap call per new video (≈0.01 ¢) |
| 2 | Provenance of every text | **missing** (examples only: `examples/reels.jsonl` `ok` = approved, others published) | `ai_text_revisions.provenance` ∈ OWNER_ORIGINAL, OWNER_TRANSCRIPT, AI_DRAFT, OWNER_EDITED, OWNER_APPROVED, PUBLISHED, plus generation id, parent revision, model, pack revision. Retrieval weight OWNER_ORIGINAL > OWNER_EDITED > OWNER_APPROVED > OWNER_TRANSCRIPT; AI_DRAFT is never a style example | Any example in a prompt shows who wrote it; a test that AI_DRAFT never enters retrieval | — |
| 3 | Draft → final → publication → video → analytics | **missing** for Reels (Telegram posts published by the studio are linked to their publications) | `content_ai_links(final_revision_id, publication_id, content_item_id)`. Reels are published outside the studio: the studio proposes the match (publish time ± 6 h and caption similarity) and the owner confirms in one tap | From a TikTok video id the chain opens back to the task, draft, edits, final, pack revision and the 72 h review | — |
| 4 | Draft → final diff | **missing** | On approval store the AI draft, the final, the diff, the edit ratio and changed parts (hook, structure, swearing, joke, CTA, mechanics, length, AI wording; tagged by code, the cheap model only for «joke/structure»). Evidence first, not rules | «Owner rewrites 65% of hooks, 12% of the middle» is a query | cheap tagging ≈0.02 ¢ per approval |
| 5 | Only the needed context | **designed** (`docs/ai/README.md`: pack + ≤15 lexicon lines + 3–4 examples ≈ 3.2k input tokens); **built**: the usage ledger with input, cached, cache-write, output tokens, cost and kind (`ai_usage`, migration 0053), average per request in «Настройки → ИИ» | Context assembler in the AI module; the ledger shows the real average per draft | — |
| 6 | Static voice vs current state | **designed, adopted now**: `pack/core.md` is static; `pack/state.md` (new) holds rank, heroes being learnt, current experiments, temporary CTAs, and is sent after the stable prefix so its edits do not break the cache | The owner edits `state` in the studio without touching the voice | — |
| 7 | Direct vs automatic mode | **designed, adopted now** (`pack/output.md`): direct — keep 2–4 owner phrases, 3 hooks, one script, ask if experience is missing; automatic — confirmed facts only, one draft, never «я играл / мне понравилось» unless in the input | A test: an automatic news post with no owner experience contains none of «я попробовал», «я играл», «мне понравилось» (code check) | automatic drafts are cheaper: one variant |
| 8 | Expensive vs cheap model | **built** for the connection check (cheap model first); **designed** for the rest: draft model only for Reels and voice-critical posts; cheap model for tags, classification, extraction, rule candidates, consolidation, anti-AI review after a code hit | Ledger by kind | — |
| 9 | Anti-AI without a second pass every time | **designed**: code checks first (stop phrases, «не просто X, а Y», symmetric pairs, repeated connectors, wrong format ending, length, headings/emoji); the cheap model and a rewrite of the flagged fragment only on a hit | A clean draft is never rewritten (test) | ≈0 for clean drafts |
| 10 | Rule lifecycle | **designed** (PLAN): statuses candidate → supported → strong → deprecated; `ai_learning_rules` + `ai_rule_evidence` (support/contradict); supported after 2 independent confirmations, strong after 3 clean ones without contradiction; decay without confirmation; cap ~25 in the prompt | A test: one video cannot make a strong rule; every rule opens its evidence | — |
| 11 | Fact vs hypothesis | **designed**: reviews store fact (numbers at T+N), observation (vs baseline), hypothesis (with «возможно», count of confirmations, confounders) in separate fields | Review text never states a cause as proven | — |
| 12 | Confounders | **built** in part: a TikTok video that stops dead or vanishes is flagged (bot alert «перестал набирать / пропал»); **designed**: per-video flags restriction, format, hero/topic, publish time, platform, incomplete data; a flagged video is excluded from baselines and rules | Carry90-like videos are marked «загрязнён» | — |
| 13 | T+72 review | **designed**: result vs same-format baseline, velocity, shares/likes/comments per 1 000, hook, topic, structure, confounders, keep, next test; output 1–3 observations, ≤2 hypotheses, one next test, never a rule directly | Shape checked in code | one cheap call per video |
| 14 | Weekly compact «Мой опыт» | **designed**: weekly batch merges evidence, adjusts confidence, drops stale, writes a few hundred tokens into `pack/lessons.md` (the DB keeps all evidence) | Prompt size of lessons stays ≤ ~400 tokens | Batch API, half price |
| 15 | Editor quality metrics | **designed**: edit ratio (main), hook edit ratio, full rewrite rate, accepted unchanged / with minor edits, cost, time to approval, owner buttons «шутка не зашла», «не мой стиль», «факт неверный»; never LLM self-scores | Shown in «Настройки → ИИ» | — |
| 16 | Blind test | **designed**: 5–10 real + 5–10 AI texts on close topics, shuffled; also current vs candidate model/pack | Monthly | cents |
| 17 | Example ranking | **designed**: same format → same hero/topic → similar intent → similar length → gold/approved → recent owner-edited; the most relevant last before the task; anti only when the task risks the same mistake | — | — |
| 18 | Lexicon by match | **designed**: `lexicon.jsonl` `w` words matched against the task, ≤15 lines | — | — |
| 19 | Facts only from sources | **built** for Dota patches (the dota module parses patch notes into facts before any wording); **designed** for news: source → normalize → dedupe → confirmed facts → wording; unofficial sources labelled «слух»; each post keeps its source facts | A post opens its facts | — |
| 20 | Approval policy | **built** by rule: nothing is published without the owner's approval (docs/PLAN.md). Per content type: everything `draft_requires_approval` now; `auto_publish_allowed` only by a later owner decision per type | — | — |
| 21 | Embeddings | **designed** (P2, `research.md`): embed posts and Reels once, cosine in the Worker over D1 | — | < $0.01 once |
| 22 | Prompt caching | **built**: cached and cache-write tokens are logged; caching is not assumed in prices or design | — | — |

## Data model (to build; the review's proposal, adjusted)

- `ai_generations` — one row per model call that produced text: kind, format, mode (direct/automatic), model, pack revision, task, output, a link to the `ai_usage` row (tokens and cost already live there, migration 0053).
- `ai_text_revisions` — id, generation id, parent id, provenance, text, created at, approved at.
- `ai_edit_feedback` — generation id, final revision id, diff, edit ratio, changed-part tags, owner feedback buttons.
- `content_ai_links` — final revision id, publication id, content item id (confirmed by the owner for Reels).
- `ai_learning_evidence` — id, source type (edit, analytics, owner), source id, scope (format), observation, weight.
- `ai_learning_rules` and `ai_rule_evidence` — as in item 10.
- `content_items.format` — item 1.

## Order of work

1. Context assembler + direct mode + code anti-AI checks + generations/revisions with provenance (first drafts can be written).
2. Approval stores the final and the diff; edit ratio in settings.
3. Item format and same-format baselines; Reels ↔ final text linking.
4. T+72 review, evidence, rules with statuses, weekly «Мой опыт».
5. Automatic mode from news; blind test; embeddings.
