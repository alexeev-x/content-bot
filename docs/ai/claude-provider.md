# Claude as a second AI provider: plan and what improves the writing (checked 21.10.2026)

Decision: `docs/DECISIONS.md` (21.10.2026) — Claude joins next to the current provider for a blind comparison on the
same writer tasks; the owner picks. Not built yet; this page is the plan and the reference it rests on (Anthropic's
Claude API documentation as of October 2026).

## 1. How it fits

- **One port, one more adapter.** Every model call goes through `AiTextProvider` (`modules/ai/ports.ts`); OpenAI is the
  first adapter. A Claude adapter (`modules/ai/anthropic-provider.ts`) uses the official `@anthropic-ai/sdk` (it runs on
  Workers: fetch-based). Nothing above the port changes: the writer, the planner, the fact check and the reviews call
  `provider.complete({ model, instructions, input, jsonSchema, maxOutputTokens, signal })` as today.
- **Mapping.** `instructions` → `system` with `cache_control` (the pack is the stable prefix: core voice, the format,
  the output rules, the lessons); `input` → the user message; `jsonSchema` → structured output
  (`output_config.format`, the same JSON the writer already asks for); `usage` → our ledger, with Claude's cache reads
  and writes (`cache_read_input_tokens`, `cache_creation_input_tokens`).
- **Model and settings.** `claude-opus-5-5` (Anthropic's default, $4 / $20 per million input / output tokens, cache
  reads $0.20). Thinking is always on (it cannot be disabled on this model) and its depth is `output_config.effort`:
  the default is `medium`; the comparison runs `medium` and `high`. `max_tokens` 16 000 (thinking counts toward it).
  No assistant prefill (the writer does not use it). A safety refusal (`stop_reason: "refusal"`) is handled, with
  Anthropic's server-side fallback (`fallbacks: "default"`) so a declined request is answered by another model.
- **Settings and budget.** «Настройки → ИИ» gains the provider choice; the catalog lists Claude's models with prices,
  so every call is counted against the monthly budget and the daily cap like today. The key is the Worker secret
  `ANTHROPIC_API_KEY`, set by the owner; never stored, logged or returned.

## 2. What it costs (estimate, to be measured)

One writer call is about 6–8 thousand input tokens (the pack is ~9.5 thousand characters; examples and the task add
the rest) and 1–3 thousand output tokens with thinking at `medium`. On Claude Opus 5.5 that is roughly **6–9 ¢** per
draft, **10–15 ¢** with the fact check and an occasional fix; a five-post series with its plan **0.6–0.9 $**. Prompt
caching cuts the repeated pack to a tenth after the first call; the measured figures replace these after the first runs.

## 3. The blind comparison

- **Tasks:** the same automatic tasks both providers get — the Dark Carnival series, Trove of Terror, a patch, two
  rubric posts — each written once by each provider (same pack, same facts, same fact check).
- **Studio:** a page «Сравнение» shows each task's two versions as A and B in random order, the provider hidden; the
  owner picks the better one or «одинаково», with an optional note. The tally per provider decides; the notes feed the
  pack.
- **Cost:** about 10 tasks × 2 providers — a few dollars.

## 4. What else makes Claude write better (ranked by value for cost)

1. **An eval set and prompt iteration.** The surest gain on any model: a set of real tasks with the owner's approved
   texts as references, a judge (a model call with a rubric: voice, facts, hook, length, no stock phrases) and a loop
   that changes one thing in the pack at a time and keeps it only when the score rises. Anthropic's guidance and our own
   research (`research.md` §3, §5) agree it beats guessing.
2. **Grounded facts.** Claude Opus 5.5 is, by Anthropic's testing, much less likely to state what its inputs do not
   support; with the fact-check pass (built) the remaining invented details are caught. Claude's citations feature
   (each claim pointing at the fact it came from) is the stricter option if the check is not enough.
3. **Naming what to avoid, concretely.** Claude follows a list of named patterns better than a general «не звучи как
   ИИ»; our rule (owner, 16.10.2026: cut a habit from the examples first) stays — a named pattern is added only when
   the examples are clean and the habit persists.
4. **Prompt caching.** The pack first and unchanged, the task last: cached reads cost a tenth, which pays for `high`
   effort where the comparison shows it matters.
5. **Effort per task.** `medium` for news, `high` for series plans and rubrics if the eval shows a gain; lowering effort
   reduces thinking more reliably than asking for brevity.
6. **Batches for what can wait.** Weekly rubrics can go through the Message Batches API at half the price (answers
   within 24 hours); news never does.
7. **The top model, if needed.** Claude Fable 5.1 is Anthropic's most capable model at $10 / $50 — a third column in the
   comparison only if Opus does not win clearly.

Not for this job now: **Managed Agents** (Anthropic runs an agent loop with a sandbox — our posts need one model call
each, and Cron and the Queue already schedule them; it may suit the scheduled research rubrics later), **Agent Skills**
(they make files such as decks and documents), the **memory tool** (our style lessons already live in D1), the
**advisor tool** (a cheaper model consulting a stronger one — not needed when the strong one writes).

## 5. The owner's steps

1. Sign in at console.anthropic.com → Settings → API keys → «Create key»; add a payment method or credit (Billing).
2. Cloudflare → Workers → the DEV Worker → Settings → Variables and Secrets → Add → Secret `ANTHROPIC_API_KEY`.
3. For local runs, the same line in the root `.env` (`npm run dev` merges it).
