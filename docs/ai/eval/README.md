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

## Runs

**20.10.2026, DEV, gpt-6.1-sol, 21 briefs** (drafts in `.logs/ai-eval/p3-run-1.json`, ratings beside it). Counts:
16 ready, 5 needs_facts (every «Учусь играть» brief without the owner's experience asked a question), 0 failed,
0 code-check warnings; 4–30 s per draft; cost $0.167. Owner's ratings (manual): «Учу фидить» — the bodies and the
feed turn mostly «мой стиль», the hooks weak (they gave the harm away in the first phrase, skipped the topic as the
opening question, read like three different videos, lacked emotion); «как не проиграть линию» «мимо»; all seven
Telegram posts «норм». The pack was changed four times after the owner's words (hooks, news and patch posts, hooks of
one video, patch numbers in plain words) and the «Учу фидить» briefs rerun (`p3-run-4.json`, $0.108): hooks now open
with the topic or a controversial claim and belong to one video; bodies «норм», two of three hooks still too calm for
the owner, who chose to teach hooks through his edits. A patch post from the real «Летняя чистка 2026» page was
«норм»; patch posts are a separate task.
