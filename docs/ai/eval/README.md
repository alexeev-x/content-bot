# Control run

A fixed set of topics (`control-set.jsonl`) rerun after a model, prompt or pack change, so a change is judged
on the same tasks. Reels topics hold their original out of the prompt (`holdOut`), so the draft is compared
with a text the model did not see. Run through the studio API `POST /api/v1/ai/drafts` on DEV, one topic at a
time (DEV allows 200 per 10 minutes through `AI_DRAFT_LIMIT` in `apps/backend/wrangler.jsonc`; production keeps the default 20, and any value is capped at 500). Results stay out of Git (`.logs/ai-eval/`); each run's drafts side by side with the originals go to `run-N.md` with a short summary here (AI plan §3).

## What every run records

So two runs can be compared:

- **Set:** the control set above (21 briefs: the original 15, five engineering cases added for P0, and `tg-patch-direct` from the owner's DEV run of 19.10.2026), or the owner's paired set — the same briefs before and after one change. The five new cases have no owner originals and are not a substitute for the owner's 20-brief paired set.
  The five-repeat check sends one brief five times in a row and counts repeated topics, devices and endings.
- **Model and pack:** the model from the draft's `model` field and the commit of `docs/ai/pack` deployed on DEV (the
  generation row keeps the pack hash in `ai_generations.pack_revision`).
- **Counts:** ready / needs_facts / failed, code-check warnings by code, and seconds per draft.
- **Cost:** the run's spend from «Настройки → ИИ» (before and after), never an estimate.
- **Ratings:** the owner's ratings are a manual observation and are written as such, apart from automatic counts;
  a model never rates its own drafts.
