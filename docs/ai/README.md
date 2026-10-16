# AI writer: what the model reads

Owner decision 16.10.2026: the studio controls the AI writer; this folder is its only source. Model-facing text is Russian and terse (imperatives, no tables, no sources or dates inside it); everything a person needs to know is in this README.

| Path | What | Sent to the model |
|---|---|---|
| `pack/core.md` | voice of ALEXEEV + «don't sound like AI» | always |
| `pack/format-*.md` | one card per format: `uchu-fidit`, `uchus-igrat`, `standalone` (Reels), `telegram` | the task's format only |
| `pack/state.md` | seed for the current state (rank, heroes being learnt, experiments); at runtime the state lives in D1 and is edited in the studio | always (from D1) |
| `pack/lessons.md` | seed for «Мой опыт» (what analytics showed so far); at runtime rules and «Мой опыт» live in D1, never written back to Git | always (from D1) |
| `pack/output.md` | answer shape and the final self-check | always |
| `lexicon.jsonl` | Dota slang, nicknames, memes: `w` words that match, `m` meaning, `s` kind, `t` classic/current/owner | only entries whose words occur in the task (≤ 15) |
| `examples/reels.jsonl` | 37 exact Reels texts: `f` format (`fidit`, `igrat`, `solo`), `r` role (`g` gold, `r` reference, `a` anti), `ok` approved exact text, `t` text, `m` metrics snapshot, `n` note | 3–4 of the same format, gold first, then closest by topic |
| `examples/telegram.jsonl` | 520 channel posts: `d` date, `k` kind (`caption`, `call`, `post`, `review`), `t` text, `g` best | 3–4 of the same kind, best and closest first |
| `research.md` | research on context engineering (for people) | never |
| `sources/` | the owner's original guides, archives and analytics journal (for people; ChatGPT-era process rules there are superseded) | never |

**Assembly order** (stable prefix first, so the provider can cache it): `core` → `format-*` → `output` → `lessons` → `state` → matched lexicon lines → examples (most relevant last) → the task. Architecture and readiness checklist: `architecture.md`. Examples are rendered as plain text, not JSON: `Пример (Учу фидить, эталон):` and the text; lexicon lines as `слово/слово — смысл`. Anti examples are sent only with a «так не надо» label and only when the task risks the same mistake.

**Budget per draft** (estimate, Russian ≈ 3 characters per token; real counts come from the usage log): stable prefix ≈ 5 500 characters ≈ 1 800 tokens; examples ≈ 900 tokens; lexicon ≈ 300; task ≈ 200 → ≈ 3 200 input tokens; answer (3 hooks + script) ≈ 600 tokens. GPT-6.1 Sol ≈ 1.2 ¢, GPT-6 Luna ≈ 0.06 ¢.

**Text fixes in examples:** obvious speech-to-text slips are fixed («дату» → «Доту», «Гобен» → «Габен», «сопорт» → «саппорт», «Леон» → «Лион», «Эмигма» → «Энигма»); three garbled endings («Очень дату», «Очень офигеть!», «Очень фиолетовую ноту») are removed (confirmed as noise by the owner 16.10.2026). The wording is otherwise the owner's; originals are in `sources/`.

**Kept in code, not in the prompt:** an approved text is stored exactly and never «improved»; drafts are never called final; endings stay per format; metrics are compared within one format at the same age.
