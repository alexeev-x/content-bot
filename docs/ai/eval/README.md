# Control run

A fixed set of topics (`control-set.jsonl`) rerun after a model, prompt or pack change, so a change is judged
on the same tasks. Reels topics hold their original out of the prompt (`holdOut`), so the draft is compared
with a text the model did not see. Run through the studio API `POST /api/v1/ai/drafts` on DEV, one topic at a
time (DEV allows 200 per 10 minutes through `AI_DRAFT_LIMIT` in `apps/backend/wrangler.jsonc`; production keeps the default 20, and any value is capped at 500). Results stay out of Git (`.logs/ai-eval/`); each run's drafts side by side with the originals are in `run-N.md`, the summary below.

## What every run records

So two runs can be compared (stage 0 of [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md)):

- **Set:** the control set above (15 briefs), or the owner's paired set — the same briefs before and after one change.
  The five-repeat check sends one brief five times in a row and counts repeated topics, devices and endings.
- **Model and pack:** the model from the draft's `model` field and the commit of `docs/ai/pack` deployed on DEV (the
  generation row keeps the pack hash in `ai_generations.pack_revision`).
- **Counts:** ready / needs_facts / failed, code-check warnings by code, and seconds per draft.
- **Cost:** the run's spend from «Настройки → ИИ» (before and after), never an estimate.
- **Ratings:** the owner's ratings are a manual observation and are written as such, apart from automatic counts;
  a model never rates its own drafts.

## Run 1 — 16.10.2026, gpt-6.1-sol, pack as of commit 888e87d

- 15 of 15 answered, no provider error; $0.092 in all, $0.006 per draft.
- Time: «Учу фидить» 17–22 s per draft (close to the bot's 25 s limit), the rest 3–9 s.
- «Учу фидить» (5): full scripts in the rubric's voice (the harmful advice played straight, blame on teammates,
  swearing, a punchline ending, no «подпишись»); no code-check finding. To judge by the owner against the
  originals.
- «Учусь играть» (5): all five asked the owner for their experience instead of writing (pack/output.md: no
  invented experience). Correct, but the bot stored a reply to that question as an edit of the text. Fixed:
  the question is marked `NEEDS_FACTS`, shown without approve buttons, and a reply to it writes the script
  with the owner's words added.
- Telegram (5): short posts in the channel voice («Мужчины», «))», «p.s.»); the automatic patch post states
  only the given facts. One odd line (the poll post ends with «пойду фидить катку»).
~~~~
