# AI writer: what the model reads

What is left of the AI plan: [ALEXEEV_AI_DEVELOPMENT_AND_TEST_PLAN.md](../ALEXEEV_AI_DEVELOPMENT_AND_TEST_PLAN.md). Component design and checklist: [architecture.md](architecture.md); the learning cycle (owner rules, analysis rules, lessons from edits) is item 10 there.

Owner decision 16.10.2026: the studio controls the AI writer; this folder is its only source. Model-facing text is Russian and terse (imperatives, no tables, no sources or dates inside it); everything a person needs to know is in this README.

| Path | What | Sent to the model |
|---|---|---|
| `pack/core.md` | voice of ALEXEEV + «don't sound like AI» | always |
| `pack/format-*.md` | one card per format: `uchu-fidit`, `uchus-igrat`, `standalone` (Reels), `telegram` | the task's format only |
| `pack/state.md` | seed for the current state (rank, heroes being learnt, experiments); at runtime the state lives in D1 and is edited in the studio | always (from D1) |
| `pack/lessons.md` | static seed for «Мой опыт» (past hypotheses); **currently bundled in AI_PACK.lessons**, not yet updated from D1; runtime rules/memory are planned | always (currently static; D1 later) |
| `pack/output.md` | answer shape and the final self-check | always |
| `lexicon.jsonl` | Dota slang, nicknames, memes: `w` words that match, `m` meaning, `s` kind, `t` classic/current/owner | only entries whose words occur in the task (≤ 15) |
| `examples/reels.jsonl` | 37 exact Reels texts: `f` format (`fidit`, `igrat`, `solo`), `r` role (`g` gold, `r` reference, `a` anti), `ok` approved exact text, `t` text, `m` metrics snapshot, `n` note | 3–4 of the same format, gold first, then closest by topic |
| `examples/telegram.jsonl` | 520 channel posts: `d` date, `k` kind (`caption`, `call`, `post`, `review`), `t` text, `g` best | 3–4 of the same kind, best and closest first |
| D1 `ai_text_revisions` | the owner's approved texts of the task's format that the owner changed (edit ratio > 5%); never an AI_DRAFT or an approval of the model's words unchanged | up to 2 of the 20 newest, ranked by the task's word stems they share (recency only breaks ties and adds a small bonus; `rankOwnerTexts`), the most relevant last, right before the task; the bundled examples give way so the total stays 3–4 |
| `research.md` | research on context engineering (for people) | never |
| `claude-provider.md` | Claude as a second provider: the adapter, the blind comparison's result, what improves the writing (for people) | never |
| `sources/` | the owner's original guides, archives and analytics journal (for people; ChatGPT-era process rules there are superseded) | never |

**Assembly order** (stable prefix first, so the provider can cache it): `core` → `format-*` → `output` → `lessons` → `state` → matched lexicon lines → examples (most relevant last) → the task. Architecture and readiness checklist: `architecture.md`. Examples are rendered as plain text, not JSON: `Пример (Учу фидить, эталон):` and the text; lexicon lines as `слово/слово — смысл`. Anti examples are sent only with a «так не надо» label and only when the task risks the same mistake.

**Budget per draft** (estimate, Russian ≈ 3 characters per token; real counts come from the usage log): stable prefix ≈ 5 500 characters ≈ 1 800 tokens; examples ≈ 900 tokens; lexicon ≈ 300; task ≈ 200 → ≈ 3 200 input tokens; answer (3 hooks + script) ≈ 600 tokens. GPT-6.1 Sol ≈ 1.2 ¢, GPT-6 Luna ≈ 0.06 ¢.

**Text fixes in examples:** obvious speech-to-text slips are fixed («дату» → «Доту», «Гобен» → «Габен», «сопорт» → «саппорт», «Леон» → «Лион», «Эмигма» → «Энигма»); three garbled endings («Очень дату», «Очень офигеть!», «Очень фиолетовую ноту») are removed (confirmed as noise by the owner 16.10.2026). The wording is otherwise the owner's; originals are in `sources/`.

**Author state is background** (owner, 16.10.2026: a post about turbo got «я кнопки на Оракле читаю»): it goes under a «фон, не тема» header and never supplies experience — that comes only from the task; a Telegram post gets it without the Reels rubric lines («Рубрики», «Текущие эксперименты»). The address («мужики», «мужчины», «парни») is off by default and flagged by the code check.

**Answer shape** (16.10.2026): the model answers through structured output (JSON schema in `writer-answer.ts`, rules in `pack/output.md`): `draft` (text, hooks, plus topic, comic device and ending type), `needs_facts` (a question) or `ideas` (2–3 topics and a question, for «придумай сам» in a format that needs real experience). A request for facts is stored as `needs_facts` without an AI_DRAFT and the server refuses to edit, approve or publish it (`NOT_A_DRAFT`); a wrong shape fails as `AI_BAD_FORMAT`, never guessed. «Придумай сам» is detected by code (`asksToInvent`) and is not the automatic mode. The prompt lists the format · topic · device · ending of the last 20 drafts of every format (never their texts); only when the writer picked the topic itself, a new one that shares most words with one of them is flagged `TOPIC_REPEATED`, without an extra model call — a topic the owner names is never blocked. A signature phrase («мой тупой мозг», «серьёзный человек», «запомни»…) that came in two of the last 5 drafts rests for the next one («СЕЙЧАС БЕЗ»): frequency, not a ban. Code checks also flag a doubled word (`DOUBLED_WORD`) and a patch change the task never mentioned (`PATCH_UNVERIFIED`).

**Kept in code, not in the prompt:** an approved text is stored exactly and never «improved»; drafts are never called final; endings stay per format; metrics are compared within one format at the same age.

## Trials (owner 29.10.2026, iron rule)
One OpenAI key serves production: a trial that empties the balance stops the bot's AI too (29.10.2026: ~384 trial posts ≈ $9).
Before any run with the AI, tell the owner «≈ N calls ≈ $X». Debug prompts on the cheapest model (`gpt-6-luna`), then judge
3–5 posts on the production model. About $1 per rubric at most; stop at the first 429.
