# Metrics per finished task

Append one JSON line to `.agent-metrics/log.jsonl` (gitignored):

```json
{"date":"2026-10-03","task_id":"BE-2","type":"backend","roles":["backend","qa-security"],"models":{"backend":"sonnet","qa-security":"opus"},"repair_loops":1,"first_pass_ci":false,"review_defects":2,"human_interventions":0,"minutes":34,"cost_usd":null}
```

- Cost: Claude `claude -p --output-format json` reports `total_cost_usd` and usage. In interactive sessions use `/cost`. Codex: use its usage output if available, else `null`.
- The goal metric is **cost per accepted PR**, with first-pass CI rate and post-merge defects alongside. Don't judge by first-response tokens.
- Change model or role settings only after comparing 8–10 similar tasks per configuration. Never claim savings without that comparison.
