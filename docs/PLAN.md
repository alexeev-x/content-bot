# Product plan

Written 20.10.2026 with the owner; replaces the plan of 14.10.2026. A general direction, to be narrowed with the owner
into tasks. Only what is not built yet.

## Goal

The AI makes the Telegram channel's content itself: news and rubric posts drafted from sources, the owner approves.

## 1. Sources

- Today two are connected: Steam News of Dota 2 (`steam_news`) and the official patch notes (`patch_notes`). A Steam
  announcement is drafted by the AI writer in the bot; the studio's «Прошлые анонсы» lets the owner try a past one.
  Patch notes still use a template.
- A Dota event announcement (an event like «The Dark Carnival», a treasure, …) always carries its image in the post
  (owner, 21.10.2026); other sources get their own rules later. Today the AI draft is text only.
- A treasure post lists its sets, images and price. Liquipedia had the sets 35 minutes after Valve's announcement
  (Trove of Terror) and never the price. To try first: Steam's item schema and asset prices with the owner's free Steam
  Web API key (`STEAM_WEB_API_KEY`), which could give them at the announcement. Otherwise two posts (owner): the news at
  once, then the sets with images (two posts when there are many), the last one ending with the price.
- An event with its own dota2.com page (e.g. dota2.com/darkcarnival) becomes a series of posts, not one (owner,
  21.10.2026): the page's own texts — Valve's Russian translation among them (story, how it works, rewards, the
  treasure's sets, personas) — and images are read; the AI first plans the series (how many posts, one topic each, in
  a logical order, no repeats, which images go where), then writes each post; they go out spaced in time. A trailer
  is linked when the page has one. Without such a page (Trove of Terror) the post comes from the announcement.
- Sources come in two kinds (owner, 21.10.2026): important ones, whose news the studio writes and publishes by itself
  as soon as it appears, and scheduled rubrics (e.g. a weekly «worst heroes» from a stats API). Publishing without the
  owner is decided (`docs/DECISIONS.md`, 21.10.2026: Valve posts at the owner's night); its safeguards come with it.
- Find and add more that give a post a day without the owner's work; each must be free, keyless or with a free key,
  and allowed by its terms.

## 2. Rubrics the AI runs itself

Many repeatable rubrics the AI drafts from the sources on its own schedule; the owner approves or edits. Their results
show in Аналитика → «Рубрики Telegram».

## 3. News

The AI turns new source events into news posts in the owner's voice: what happened, why it matters to a player.

## Next: video

Once 1–3 are done (owner, 20.10.2026): video. Planned with the owner when it starts.
