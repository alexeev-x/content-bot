# AI voice without fine-tuning: reference (checked 2026-10-15)
Legend: [V]=verified on primary page, [S]=secondary/search summary, [U]=unverified/inference.

## 1. Exemplar selection and retrieval
- Few-shot beats zero-shot on all metrics; 2 -> 10 examples adds very little (saturation). Informal text (blogs) was imitated badly (verification ~17-21%), and output was still flagged as AI. "Catch Me If You Can? Not Yet" EMNLP Findings 2025, https://arxiv.org/abs/2509.14543 [S: via search summary]. Implication: informal crude style is the hard case; a style card plus 3-5 examples is enough, more is waste.
- Personalization retrieval (LaMP https://arxiv.org/abs/2304.11406, LongLaMP https://arxiv.org/abs/2407.11016): retrieving from the user's own profile beats no retrieval; more items help up to a point; one paper found best k=4 on one task and "more keeps helping" on another (https://arxiv.org/pdf/2504.05731) [S]. 3-4 examples is a sane default.
- Ordering: recency bias and order sensitivity are real (Nguyen et al., https://arxiv.org/abs/2302.11042 [S]); the most similar example is best placed last, right before the task [S/U practitioner advice].
- Diversity vs similarity (MMR): no primary evidence found [U]. Heuristic: take top-k by similarity, then drop near-duplicates, and include one example of the same format (length bucket) as the task.
- Cheap similarity:
  - OpenAI text-embedding-3-small $0.02 / 1M tokens [V] https://developers.openai.com/api/docs/pricing. 520 posts x ~30 tokens is about 16K tokens, under $0.001. Per-request query embedding is negligible. Embedding is effectively free; do not build BM25 hacks for cost reasons.
  - Workers AI: 10,000 Neurons/day free; bge-m3 $0.012/1M tokens (1,075 Neurons/1M) [V] https://developers.cloudflare.com/workers-ai/platform/pricing/. Multilingual (Russian) bge-m3 stays inside the free tier [multilingual claim U for this page; model name only].
  - Vectorize Free: "30 million queried vector dimensions / month", "5 million stored vector dimensions" [V] https://developers.cloudflare.com/vectorize/platform/pricing/. 520 x 1024 dims = 0.53M stored; 300 queries x 4 x... easily fits.
  - Simplest: store vectors as BLOB/JSON in a D1 table and compute cosine in the Worker (520 rows x 1024 floats is ~2 MB; fine, or use 512-dim via `dimensions` param [U]). No Vectorize needed at this size.
  - Fallback without any embeddings: FTS5/BM25 in D1 on lemma-less tokens [U for Russian morphology quality].

## 2. Learning from edits without training
- PRELUDE/CIPHER (Gao et al., 2024): LLM infers a latent preference description from each (draft, user edit); for a new context retrieve preferences from the k closest past contexts and aggregate them; lowest edit-distance cost vs baselines at small extra LLM cost; tested with a GPT-4 simulated user on summarisation and email, not real humans [V abstract] https://arxiv.org/abs/2404.15269. Key idea for us: store the rule next to the context embedding and retrieve per request instead of putting all rules in the prompt (fixes rule bloat).
- Memory management (decay, conflict, budgets): no solid primary evidence collected [U]. Engineering proposal: each rule has weight, hits, last_confirmed; +weight when a later edit confirms, -weight when the owner's final text violates it; hard cap ~25 rules (~600 tokens) in the always-on profile; the rest retrieved; contradictory rules merged by a monthly LLM consolidation pass.
- Preference pairs as in-context examples: use (AI draft -> owner final) pairs of 1-2 retrieved similar cases as "before/after" in the prompt [U for measured gains; CIPHER learns rules from the same pairs]. Very short posts (66 chars) make pairs cheap.
- Self-learning from raw pairs: edit-distance ratio per post as metric aligns with CIPHER's own metric [V].

## 3. Evaluating style imitation cheaply
- Authorship verification / attribution with an LLM judge, plus AI-detector and style matching, used as complementary metrics in https://arxiv.org/abs/2509.14543 [S]. Note: detector scores are unreliable on informal text and for Russian [U].
- OSST: log-prob of target text after one-shot style transfer discriminates same-author texts https://arxiv.org/abs/2510.13302 [S]; needs logprobs, which the Responses API may not expose for our models [U]; skip.
- Cheap proxies (engineering, [U] as validated metrics): (a) normalized edit distance draft vs final (our main metric, ground truth); (b) length-distribution match with owner posts; (c) lexicon hit-rate of owner slang / stop-list phrase rate; (d) pairwise blind test: owner picks "which is mine" among 1 real old post + 1 generated, 20 items per month in the bot UI; (e) LLM judge A/B between prompt versions on a fixed 30-brief regression set (judge is a proxy; calibrate against owner picks).
- Beware: LLM judges favour longer, more polished text, i.e. the opposite of a crude median-66-char voice [U inference].

## 4. Pipeline tricks
- Self-Refine: ~20% absolute avg gain on 7 tasks with GPT-3.5/ChatGPT/GPT-4 [V abstract] https://arxiv.org/abs/2303.17651; but intrinsic self-correction without external signal often does not help or hurts on reasoning (GPT-4 GSM8K 95.5->91.5 [S]) https://arxiv.org/abs/2310.01798. For style, a critique pass with a concrete checklist (stop-list, length, lexicon) is external-signal-like, so cheaper rule-based checks first (regex stop-list, length bound) and an LLM pass only on violations [U].
- N candidates + judge: no primary cost/benefit found for style [U]. Cheap variant: 1 call, ask for 3 variants in one output (shares input tokens), owner picks; the pick is a free preference signal.
- Anti-examples: no primary evidence [U]. Safer is an explicit stop-list of phrases plus 1-2 "bad/good" pairs from real edits (see section 2).
- Style card vs raw examples: no head-to-head found [U]. Literature supports examples; card gives format/rules. Use both (already planned).
- Plan->draft->revise: for 66-char posts overhead exceeds benefit [U]; reserve for 800-1600-char reviews.

## 5. Prompt optimisation loops
- DSPy: bootstrapped demos beat standard few-shot (authors' claims >25% GPT-3.5, case studies) [V abstract, vendor-ish] https://arxiv.org/abs/2310.03714.
- OPRO: LLM proposes instructions from scored history; up to +8% GSM8K, +50% BBH vs human prompts [V abstract] https://arxiv.org/abs/2309.03409.
- Feasibility: both need a scalar metric and many evaluations (tens to hundreds of generations per round). We have 100-300 gens/month, and our metric (owner edits) is slow and noisy, so a full DSPy/TextGrad loop is not worth it. Our weekly diff->rule job is an OPRO-lite loop with human-in-loop scoring. Optional offline: replay 50 historic posts (brief -> real post) and score with embedding similarity + lexicon hit-rate to compare two prompt variants [U].

## 6. Pitfalls
- Prompt cache: OpenAI "Cache reuse requires the entire rendered prefix to match", min 1,024 tokens on GPT-5.6+, reused tokens "discounted up to 95%", cache writes 1.25x, retention 30 min after last use [V] https://developers.openai.com/api/docs/guides/prompt-caching. Consequences: with only 100-300 gens/month, gaps often exceed 30 min, so the cache seldom hits and a 1.25x write penalty may apply on each cold request [U inference, confirm gpt-6.x behaviour]. Don't re-sort the profile or insert rules on every tweak; put stable profile first, retrieved examples and the task last; version the profile (change weekly, not per edit). Check actual cached_tokens in usage to decide if caching is worth designing around.
- Overfitting to recent edits: one edit = one hypothesis; require 2-3 confirmations before a rule enters the always-on profile (CIPHER aggregates over k contexts [V]); weight decay.
- Rule bloat: cap and consolidate (section 2).
- Model updates change style: pin model snapshot IDs, rerun the 30-brief regression set before switching [U].
- Mimicry limits: even good few-shot output is detectable as AI [S]; owner editing remains in the loop.

## Recommendation for our project (ranked value/cost)
1. Embed all 520 posts once (text-embedding-3-small, cents), store in D1, cosine in Worker; retrieve 3-4 nearest + force one same-length-bucket example; place most similar last.
2. Keep always-on profile small and stable; retrieved material after it; version weekly to protect cache; log cached_tokens.
3. Edit-diff pipeline CIPHER-style: per (draft, final) pair, LLM-cheap (luna) writes one rule; embed it; retrieve top rules per request instead of dumping all.
4. Rule lifecycle: confirmations >=2 to promote, weight decay, hard cap ~25 always-on, monthly consolidation.
5. Deterministic checks before any LLM critique: stop-list regex, length bounds, lexicon; revise only on violation. Skip generic self-critique for short posts.
6. Ask for 3 variants in one call; owner's pick/edit is the free preference label.
7. Metric: edit-ratio per post (primary) + monthly blind "which is mine" test (20 items); LLM-judge only for A/B regression on a fixed 30-brief set.
8. Pin model snapshot; rerun regression set on model change. Skip DSPy/TextGrad.
