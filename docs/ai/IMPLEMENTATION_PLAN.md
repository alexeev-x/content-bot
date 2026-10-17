# AI editor — implementation plan

**Status snapshot:** 2026-10-16, based on repository develop at a93f228 (commits 969d451 and a93f228 included).
**Purpose:** a single ordered execution checklist for Claude Code and the owner. This is a plan, not evidence of deployed functionality.

**Sources of truth:** [architecture.md](architecture.md) for component readiness, data design and analytics constraints; [README.md](README.md) for the prompt assembly and source corpus; [../DECISIONS.md](../DECISIONS.md) for accepted product decisions; [../PLAN.md](../PLAN.md) for the broader product roadmap. Keep detailed design in those documents; update this file for execution status, dependencies and acceptance.

## 0. Current position

| Capability | State on develop | Evidence / boundary |
| --- | --- | --- |
| OpenAI text provider, budgets and usage ledger | DONE in code | modules/ai/openai-provider.ts and service.ts; no production deployment claim |
| Voice and format packs, lexicon, 37 Reels and 520 Telegram examples | DONE in code | docs/ai/pack, examples and writer-prompt.ts |
| Drafts, rewrites, hooks, owner edits, approvals and server-side publish guard | DONE in code | writer.ts, d1-writer-repository.ts, bot/ai-writer.ts |
| Explicit draft / needs_facts / ideas answer, protection from approving questions | DONE in code | migration 0062, writer-answer.ts, tests; Telegram live continuation not yet checked |
| Recent topic/device/ending memory (15 per format) | DONE in code | writer-prompt.ts and d1-writer-repository.ts; not cross-format |
| Saved owner feedback, changed-part tags, edit ratio and quality panel | PARTIAL | records and reports findings, but feedback does not create active learned rules |
| Approved Reels script ↔ published TikTok/YouTube item | PARTIAL | manual link exists; full task → edit → video → outcome view absent |
| Same-format, exact-age analytic baselines | TODO | current analytics comparison is platform-wide, not format-specific |
| T+72 AI reviews and evidence-backed learning rules | TODO | specified in architecture only |
| Weekly D1 runtime "My experience" and automatic rule retrieval | TODO | current generation uses static AI_PACK.lessons from Git |
| Autonomous news drafts and any automatic AI publication | DEFERRED | news generation source flow unfinished; owner approval mandatory |

The owner's 16.10.2026 paired control run reports 14/20 complete texts before and 17/20 after, plus three explicit needs_facts results. This is a **manual evaluation observation**, not a verified regression-suite pass or production metric. Save repeatable prompts/results outside Git as the evaluation guide requires; do not train on unreviewed AI outputs.

### Hard rules for all stages

- **No AI auto-publication or request-based pre-approval.** Every AI text needs an explicit owner approval under the current decision in docs/DECISIONS.md. Do not infer permission from historical proposals.
- **No fabricated player experience, patch facts, platform metrics or causal claims.** Hypothetical content must read as hypothetical.
- **One Cloudflare Worker, one D1, existing Cron and provider ports.** No new services, expensive second LLM pass on every clean draft, fine-tuning, or model/provider swap as part of this plan.
- **Style evidence is human-confirmed.** Never feed raw AI_DRAFT or unchanged AI approval back as proof of the owner's writing.
- **DEV first.** A merged commit is not proof of a successful migration, Telegram end-to-end flow or deployment. Agents never run remote migrations, deploy production or push to main.
- **One stage at a time.** Follow dependencies; scope changes narrowly, preserve incomplete work by other agents (the owner reports separate uncommitted Reels-format frontend work).
- Track actual token/cost data through ai_usage, not guessed costs. Check against the daily/monthly caps before new LLM jobs.
- Mark a stage DONE only after checked-in code, appropriate tests, a DEV smoke check where applicable, and an owner-visible result.

## Ordered roadmap

| Order | Stage | State | Depends on | Result |
| --- | --- | --- | --- | --- |
| 0 | Stabilize the shipped editor and measurement | NEXT | none | trustworthy ready/needs_facts counts and bot round-trip |
| 1 | Improve writing quality and variety | TODO | 0 | better hooks, jokes, endings, fewer repeats |
| 2 | Make learning from owner edits useful | TODO | 0–1 | curated, relevant examples and attributable feedback |
| 3 | Establish format-aware video measurement | TODO | 0 | honest comparisons within format and content age |
| 4 | Complete draft-to-video traceability | TODO | 2–3 | every review sees the approved script and provenance |
| 5 | Add evidence-safe T+72 reviews | TODO | 3–4 | observations and hypotheses, not invented explanations |
| 6 | Add learning rules and weekly runtime memory | TODO | 2, 5 | evidence-backed, owner-controlled improvement loop |
| 7 | Validate and expose the learning process | TODO | 1–6 | visible effect, controlled comparisons, quality monitoring |
| 8 | Consider optional optimization and future automation | DEFERRED | stable 7 | embeddings/news drafting only if justified |

Stages 2 and 3 can be designed independently; implement 3 before 5, and do not start 6's video-derived rules before 5 is reliable.

## Stage 0 — stabilize the current editor (NEXT, P0)

**Why now:** commits 969d451/a93f228 fixed important correctness issues, but DEV operation and quality-count semantics still need verification.

- [x] Use structured output for draft vs needs_facts/ideas; no AI_DRAFT revision for a question.
- [x] Block edit, hook change, approval and publication for needs_facts, including legacy warning-only rows (automated tests).
- [x] Store and pass the recent 15 topic/device/ending facets within a format.
- [ ] Verify DEV CI migration 0062 actually applied and endpoint returns the new result shape; record the commit and test time.
- [ ] Live Telegram smoke: /redactor → "Учусь играть" → "придумай сам" → select an idea and reply with a real match detail → get a full draft → edit/approve. Confirm original task survives, and question/ideas show no approval keyboard.
- [x] Fix quality aggregation in d1-writer-repository.ts: a generation with status ready but result needs_facts must not be counted as a completed draft (or rewrite). Keep separate counts, including legacy rows, with explicit tests; check the Settings → AI quality denominator.
- [x] Regression-test the DEV limit 200/10 min, production default 20/10 min, budget gate and billed retries. Limit changes must not silently authorize higher spend.
- [ ] Record the 20-prompt paired eval and five-repeat-topic eval method, model, pack revision and observed costs; distinguish manual ratings from automated pass/fail.
- [x] Reconcile the outdated rate-limit statement in docs/ai/eval/README.md.
- [ ] Confirm separately reported Reels-format frontend work is accounted for before any overlapping UI change; do not overwrite uncommitted local changes.

**Acceptance:** one complete live Telegram question → answer → draft → approval flow; no way to approve a question; valid API status/quality counts; existing draft approval and budget tests green. **Files:** writer.ts, bot/ai-writer.ts, d1-writer-repository.ts, service.ts, ai-routes.ts, contracts only if needed, integration tests, eval guide. **No new model calls by default.**

## Stage 1 — stronger text quality and variety (P1)

- [ ] Tune per-format hooks and endings without forcing a single comedy template. Preserve the existing author voice, allowed swearing, rubric-specific CTAs and satirical vs personal-experience distinction.
- [ ] Keep the strongest hook's joke in the finished script; avoid explaining a punchline, padding to a word target or replacing a strong line with generic narration.
- [ ] Rotate comedic devices (absurdly confident advice, escalating proof, pub dialogue, inversion, personal failure, unexpected payoff), **not** a hard-coded template order.
- [ ] Reduce repeated generic wording ("мой тупой мозг", "Запомни", blaming supports), but never impose blanket bans on authentic author phrasing.
- [ ] Detect near-duplicate central ideas across formats as advisory information. Preserve an explicit owner topic even if it repeats; avoid cross-format false positives.
- [ ] Check that a Telegram invitation has a concrete action, a personal Reels story uses supplied facts, and patch claims have an authoritative fact source; flag obvious grammatical slips.
- [ ] Deterministic checks first; optional cheap-model review/rewrite **only for a specific finding**, with bounded attempts, logs and budget control. Do not revise a clean script simply because a judge can produce a variant.
- [ ] Rerun the fixed 20 briefs and the five-identical-request sequence on DEV; compare acceptance, duplicate themes, factual errors, wordiness and owner-rated humor. Keep old outputs for side-by-side review.

**Acceptance:** owner sees a meaningful improvement on the same briefs without degrading the strongest existing scripts; no invented personal results; no regressions in format contracts. **Files:** docs/ai/pack, writer-prompt.ts, writer-checks.ts, eval fixtures and tests. **Note:** the observed 17/20 ready rate is not a target to increase by fabricating details; needs_facts for real experience is correct.

## Stage 2 — learn reliably from the owner's edits (P1)

- [ ] Preserve current immutable provenance and per-approval diff/editRatio; make changes to the evidence model backward-compatible.
- [ ] Extend feedback with precise reasons (repeated topic, weak hook, bad punchline, not my style, too long, factual error, missed task), with an optional owner note and association to a specific revision. No inference of author preferences from a single dislike.
- [ ] Improve owner-example selection: same format first, then hero/topic, intent, length and explicitly owner-confirmed quality; use recency as one factor, not the only factor. Keep a 3–4 example/token bound.
- [ ] Distinguish OWNER_ORIGINAL, OWNER_EDITED and mere unchanged AI approval. Never promote unchanged AI text to human-authored evidence.
- [ ] Build a lightweight per-edit evidence record with before/after, changed part and feedback; store facts in D1 and never silently rewrite Git's style pack.
- [ ] Show the owner which correction was learned as evidence, with the ability to correct/delete the feedback; avoid self-referential AI learning.
- [ ] Add tests: only eligible human-edited/confirmed text enters retrieval; relevance ranking; removal/supersession; no learning from draft-only or nonapproved examples.

**Acceptance:** an owner edit measurably influences a relevant later brief, while an unedited AI output and an isolated negative rating cannot create a global rule. **Files:** writer.ts, writer-prompt.ts, d1-writer-repository.ts, migrations/contracts when approved, bot/UI and tests. **Dependency:** stage 6 activates general rules after enough evidence.

## Stage 3 — correct video baselines by format and content age (P0 for analytics learning)

- [x] Carry known format (fidit / igrat / standalone / telegram / unknown) from the approved script or post to the analytics item, without classifying known items again.
- [x] Provide explicit owner classification or a separate low-cost path for genuinely legacy/unknown items; never silently guess their format.
- [x] Compare only **same platform + same format + same exact checkpoint age**. Never mix YouTube and TikTok or use a neighbouring snapshot time.
- [x] Require at least **five clean comparable items** for learning evidence; if fewer, label comparison weak and do not promote rules. Existing analytics UI's N ≥ 3 presentation threshold is a separate display policy.
- [x] Mark contamination only from confirmed recommendation restrictions, deleted/unavailable content, platform incidents or broken/incomplete collection. Poor performance is a valid observation, not contamination.
- [x] Use only metrics actually available: TikTok public counters, YouTube available counters, Telegram views/reactions. No invented TikTok retention/shares or Telegram comment metrics.
- [x] Unit/integration tests with mixed formats, short samples, misaligned timestamps, sparse snapshots and confirmed contamination.

**Acceptance:** a weak "Учусь играть" video cannot be judged against strong "Учу фидить" videos, and an unsupported metric or confounded video never produces learning evidence. **Files:** content-analytics module, shared DTOs, D1 migrations and tests. **Spec:** architecture.md items 1, 11 and 12.

## Stage 4 — finish the approved-script → video chain (P1, before reviews)

- [x] Store AI_DRAFT/OWNER_EDITED/OWNER_APPROVED revisions and link approved Reels scripts to TikTok/YouTube video items with owner confirmation.
- [ ] Show verified chain: prompt → model/pack revision → original text → owner edits → approved text → published post/video → exact-age analytics.
- [ ] Surface missing/unlinked, ambiguous and mistakenly linked scripts; allow owner unlink/relink. Do not invent a script for legacy videos.
- [ ] Track real usage of an approved script in more than one platform item separately from raw output text or unchanged model approvals.
- [ ] Test editing/approval states, link ownership, repeated calls and missing-data states in both browser and Mini App.

**Acceptance:** a linked video review can retrieve the exact approved text and provenance and cannot analyze an unrelated/unchecked draft. **Files:** script-links.ts, its D1 repository, analytics API/UI and tests. **Spec:** architecture.md items 2–4.

## Stage 5 — T+72 video review with guarded conclusions (P1)

- [ ] At an eligible video age, collect reliable snapshots at the same age and the same-format baseline; schedule bounded, idempotent review through existing application/Cron components, not a new service.
- [ ] Separate **fact** (actual counters and source timestamps), **observation** (comparison), and **hypothesis** (why it might have worked). Do not claim that a hook caused success from one video.
- [ ] When baseline is weak or data is incomplete, show an honest limited review instead of a fabricated verdict.
- [ ] Analyze the approved hook, topic and structure with only supported platform signals; possible reasons remain explicitly uncertain.
- [ ] Produce a compact report: 1–3 observations, at most 2 hypotheses, one next experiment. Attach evidence references and model/cost metadata.
- [ ] Review must be retrievable alongside its source video; add deterministic schema/code checks and bounded optional cheap-model processing.
- [ ] Test no double review under overlapping Cron, incomplete snapshots, unknown format, missing approved script, unexpected platform outages and budget exhaustion.

**Acceptance:** owner can open a traceable T+72 report and distinguish measured facts from interpretations; reviews without adequate evidence do not create strong learning rules. **Spec:** architecture.md items 11–13.

## Stage 6 — evidence-backed learning rules and weekly D1 memory (P1)

- [ ] Create the designed D1 lifecycle for candidate → supported → strong → deprecated, with supporting and contradicting evidence linked to actual edits/videos/owner feedback.
- [ ] Promote a candidate only after **two independent confirmations**; strong only after **three clean confirmations without contradiction**. A lone viral video or one disliked joke is not a rule.
- [ ] Scope rules by format when appropriate. Handle contradictory evidence, declining confidence and stale rules. Keep a bounded active set (about 25) to prevent prompt bloat.
- [ ] Add an owner-visible memory/rules view: source evidence, confidence/status and explicit disable/correct/delete actions. Never auto-change immutable approved text.
- [ ] Build a bounded weekly consolidation using eligible evidence; store the resulting compact "Мой опыт" in D1 and inject it into later prompts. docs/ai/pack/lessons.md remains the static seed/fallback, not the live memory.
- [ ] Respect model and budget settings, token accounting, idempotency, partial failures and empty datasets. Consolidation must never self-promote generated hypotheses to facts.
- [ ] Test rule promotion/contradiction, owner override, fallback when D1 memory is unavailable, stale-rule retirement and max prompt size.

**Acceptance:** after independent confirming edits/results, a traceable rule affects future generation; contradicted or disabled rules cease to do so; no unsupported inference enters memory. **Spec:** architecture.md items 10 and 14.

## Stage 7 — measurable quality and acceptance (P1)

- [ ] Fix remaining quality accounting differences: draft vs needs_facts, revisions vs first drafts, approved unchanged vs human-edited, and denominators.
- [ ] Show rolling metrics by format: true ready count, needs_facts, owner approval, edit ratio, hook/ending changes, joke-missed feedback, usable-draft cost and relevant reasons for rejection.
- [ ] Make change-over-time comparisons conditional on a sufficient number of approved texts, with no invented uplift or causal attribution.
- [ ] Add/maintain a fixed DEV A/B control run before any prompt, pack or model change; preserve exact brief, model snapshot, pack revision, generation type and spend.
- [ ] Run a small blinded owner/style test (real vs model text on comparable topics); record human preferences separately from model self-scores.
- [ ] Give the owner a clear stage-by-stage checklist with test evidence and examples of actual improvements.

**Acceptance:** the owner can tell whether the editor requires fewer human changes and whether this is true across formats; regressions can be detected and reverted. **Spec:** architecture.md items 15–17.

## Stage 8 — later, only after stages 0–7

- [ ] Consider D1 embeddings for example retrieval only after measuring whether the simpler relevance ranking misses good examples; compare token cost and retrieval quality on the same briefs.
- [ ] Expand official-source news → verified facts → AI draft → owner review when content automation is separately scoped. **Not automatic publication.**
- [ ] Consider classification for truly legacy content and other optional insights only with source, cost and owner approval.
- [ ] Revisit model choice/fine-tuning, automatic publication and additional providers only on a new explicit owner decision; none is authorized here.

**Gate:** no P2 optimization until the owner accepts stage 7 and its results.

## Work packet template (use for every implementation stage)

1. **Status and base:** current develop SHA, existing working-tree changes and the specific checklist items being addressed.
2. **Scope:** exact files/modules, schema/migrations, API/UI changes and explicit non-goals. Follow repository AGENTS.md.
3. **Acceptance:** automated tests, DEV steps, evidence and expected failure cases written before coding.
4. **Safety:** provenance and approval guard, honest data, bounded requests, idempotency, costs and rollback/compatibility.
5. **Delivery:** commit SHA(s), changed paths, checks actually run, DEV validation status, real token/cost report, remaining risks and unchecked manual steps.
6. **Update this plan:** mark checkboxes only when evidence exists; record a short date/commit note below. Keep structural design in architecture.md, not duplicated here.

## Progress log

| Date | Commit / evidence | What changed | Remaining verification |
| --- | --- | --- | --- |
| 2026-10-16 | 969d451 | structured writer responses, migration 0062, needs_facts guard, recent per-format facets | live Telegram flow; DEV migration confirmation |
| 2026-10-16 | a93f228 | configurable DEV draft rate limit (200/10 minutes), production default 20 | DEV smoke; budget regression |
| 2026-10-16 | owner-provided paired control run | complete texts 14/20 → 17/20; three correctly classified fact requests; five consecutive free Telegram posts | not a code test; owner-rated writing quality and future A/B controls |
| 2026-10-16 | stage 3 (part) | a video linked to an AI script carries its format; item curve is same platform + format + exact checkpoint from 5 videos, else the platform curve labelled weak | owner classification of unlinked legacy videos; contamination marks; DEV check |
| 2026-10-16 | stage 3 (owner mark) | migration 0065: the owner marks the rubric of an unlinked video; a linked script still wins; Telegram posts have none | contamination marks; DEV check |
| 2026-10-17 | stage 3 (contamination) | migration 0066: the owner confirms a reason in the item panel; the item leaves every usual curve and the stored report rebuilds | DEV check |
| 2026-10-17 | stage 0 (quality counts) | «Качество» counts a needs_facts answer as `questions`, not a draft; a legacy row without a result stays a draft | — |
| 2026-10-17 | stage 3 (alert button) | «Ограничение подтвердилось» / «Удаление подтвердилось» under the TikTok freeze and disappearance alerts: the owner's tap marks the video contaminated | live tap on DEV |
| 2026-10-17 | stage 0 (limits) | draft limit test: the env limit holds, a refused draft never reaches the model or the ledger, the override is capped at 500; budget gate already covered (ai.test.ts); eval README reconciled | — |
| 2026-10-17 | stage 3 (metrics, tests) | collectors keep unavailable counters null (Telegram comments/shares, YouTube shares, no TikTok retention), engagement compares within one platform; checkpoint window, short samples, mixed formats and contamination are covered by tests | — |
