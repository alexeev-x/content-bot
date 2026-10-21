-- The provider comparison is removed (owner, 21.10.2026: «удали все эти тесты»; result in docs/ai/claude-provider.md
-- §3). Its code left in the previous deploy, so nothing reads the table any more. The pairs' texts stay in
-- ai_generations, like every studio draft.
DROP TABLE IF EXISTS ai_comparisons;
