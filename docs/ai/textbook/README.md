# AI textbook (ALEXEEV voice)

The single source the AI writer learns from (docs/PLAN.md stage A). Built on 16.10.2026 from the owner's materials in `docs/for claude/` (Style Bible, Master Style Guide, both rubric guides and archives, the Analytics Journal) and the owner's Telegram export. The card bodies are Russian on purpose: the model reads them.

How a request is assembled (token economy: only what the task needs, the stable part first so the provider can cache it):

| Part | File | Sent |
|---|---|---|
| Voice | `01-voice.md` | always |
| Anti-AI rules | `02-anti-ai.md` | always |
| Format card | `10-uchu-fidit.md` / `11-uchus-igrat.md` / `12-standalone.md` / `13-telegram.md` | the one the task is for |
| Lessons from analytics | `20-lessons.md` | always (short) |
| Dota lexicon | `../dota-lexicon.md` | relevant entries only |
| Examples | `examples/*.jsonl`, `../owner/telegram-posts.jsonl` | 3–4 nearest of the same format |

Example rows: `id`, `format`, `role` (`gold` best reference, `ref` normal, `anti` what not to do), `status` (`approved` = exact text the owner approved; `published` = the owner's published text, possibly a speech-to-text transcript), `hook`, `text` (for prompts; obvious speech-to-text errors fixed, wording untouched), `raw` (exact as received, only when it differs), `url`, `published`, `metrics` (snapshot with its date), `notes`.

Rules carried over from the owner's Style Bible that the system enforces in code, not in the prompt: an approved text is stored exactly and never «improved»; drafts are never called final; each format keeps its own ending; metrics are compared only within one format and at the same age; a hypothesis is never presented as a proven cause.
