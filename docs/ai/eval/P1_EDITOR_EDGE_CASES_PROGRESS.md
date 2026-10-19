# P1 Telegram editor — rewrite facts, draft identity, long text, 2026-10-19

Partial P1 package after `ee0b0fb`. A rewrite now receives the original task and the owner's confirmed facts alongside the current draft. A hook only replaces an exact known hook; otherwise it preserves the whole first line, including owner facts, and refuses instead of truncating at the text limit. Telegram preview shortening no longer splits a UTF-16 surrogate pair; the complete draft stays in D1. New Worker integration tests cover TG-05 (one-line facts, hook, then shorter rewrite), TG-08 (two drafts in one chat), TG-13 (HTML-heavy text, emoji, text longer than 4096 code units), and TG-10 (a stranger's facts answer and draft buttons are dropped: no model or Telegram call, no new revision). No new AI or memory was introduced.

| Check | Result |
| --- | --- |
| Focused `bot-ai-writer.test.ts` with real migrated D1 and fake Telegram/OpenAI | PASS locally: 12/12, including a fake Telegram rejection above 4096 visible characters ([Bot API limit is after entity parsing](https://core.telegram.org/bots/api#editmessagetext)). The first review exposed the one-line hook loss and it was fixed. |
| Full `npm.cmd run verify` and `npm.cmd run verify:changed` | Pending final run for this package. |
| Independent R2 code review | PASS after fixing the one-line hook loss. Reviewer retracted the raw-HTML-length concern against the official Bot API; no other proven blocker. |
| Live DEV Telegram, real OpenAI quality, CI for this SHA | BLOCKED / not run; local fake tests cannot establish delivery or writing quality. |
| Added model cost | $0 in local tests. |

## DEV evidence still needed

After the DEV workflow for this commit is green, use only the separate test bot/channel. Produce a question, answer with a distinctive real fact, choose another hook, then choose «Короче»: verify the rewrite keeps that fact (TG-05). Make two drafts in one chat, use a button on the older one, and verify the newer one is untouched (TG-08). Send a long task with HTML-like characters and emoji; verify Telegram shows a valid shortened preview and Studio/D1 retains the full draft (TG-13). Record the deployed SHA, time, redacted message IDs, exact PASS/FAIL, and model cost outside Git. Do not run this on production.

The quality of the generated text and all remaining P1 live cases are still unverified. **P1 is NOT READY** for owner acceptance.
