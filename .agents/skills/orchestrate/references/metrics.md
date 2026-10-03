# Metrics per finished task

Append one JSON line to `.agent-metrics/log.jsonl` (gitignored) for each completed task. Record the selected model, reasoning level and speed for the main session and each subagent. Leave unavailable values `null`.

```json
{"date":"2026-10-03","task_id":"BE-2","type":"backend","risk":"R3","roles":["backend","qa-security"],"models":{"main":"gpt-6.1-sol","backend":"gpt-6.1-sol","qa-security":"gpt-6.1-sol"},"reasoning":{"main":"medium","backend":"high","qa-security":"high"},"speed":{"main":"standard","backend":"standard","qa-security":"standard"},"repair_loops":1,"first_pass_ci":null,"accepted":true,"review_defects":2,"human_interventions":0,"minutes":34,"plus_allowance":{"source":"Codex /status","five_hour_remaining_before_pct":null,"five_hour_remaining_after_pct":null,"five_hour_reset_at":null,"weekly_remaining_before_pct":null,"weekly_remaining_after_pct":null,"weekly_reset_at":null},"cost_usd":null}
```

- `plus_allowance` is a manual observation of the displayed remaining five-hour and weekly allowance before and after the task, plus each reset time. Use `/status` or the account usage dashboard. The UI may round percentages; unavailable observations stay `null`. Do not add parent and subagent percentages: they share the account allowance.
- `npm run metrics` summarizes token counts from the Claude Code usage hook and reports relative token-price units. It does not measure Codex Plus allowance. Do not convert those units, API prices or purchased-credit rates into Plus consumption. `cost_usd` remains `null` for Plus-only Codex work unless a reliable subscription-specific value exists.
- Compare accepted tasks of similar scope, risk and verification burden. Count retries, agent launches, review defects, acceptance, first-pass CI and both allowance observations. Include failures; do not compare only first responses. Collect observations during real work rather than repeating tasks solely for a benchmark.
- Treat a small pilot as directional. Change model or role defaults only after several comparable completed tasks show acceptable quality and consistent allowance observations. Never claim a savings percentage without evidence.
