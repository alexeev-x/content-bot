# Control run

A fixed set of topics (`control-set.jsonl`) rerun after a model, prompt or pack change, so a change is judged
on the same tasks. Reels topics hold their original out of the prompt (`holdOut`), so the draft is compared
with a text the model did not see. Run through the studio API `POST /api/v1/ai/drafts` on DEV, one topic at a
time (20 per 10 minutes). Results stay out of Git (`.logs/ai-eval/`); the summary of each run is below.

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
