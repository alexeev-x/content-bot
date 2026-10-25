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
  (owner, 21.10.2026); other sources get their own rules later. Done for the approved AI post: its images are attached.
- A treasure post lists its sets, images and price. Liquipedia had the sets 35 minutes after Valve's announcement
  (Trove of Terror: sets at once, drop rates and opening bonuses after ~4 h) and never the price. Steam's Web API gives
  neither for Dota (checked with the owner's key 21.10.2026: no item schema, no asset prices for app 570); the price comes
  from Valve by the item id (below). So two posts (owner): the news at once, then the sets with images from Liquipedia or the event's
  dota2.com page (two posts when there are many).
- Built 22.10.2026 (`docs/backend/sources.md` «Treasure follow-ups from Liquipedia»; follow-ups carry no set pictures yet, though Liquipedia's `imageinfo` API gives 256×170 set icons, checked 23.10.2026). Liquipedia watch for a published event post that lacks details (owner, 22.10.2026): the sets, their images, drop
  rates or opening bonuses missing from what went out start a watch on the event's Liquipedia page (found by its
  name). Every 5 minutes one light request asks whether the page changed; the price never starts a watch (Liquipedia
  has none). Liquipedia fills a page in many small edits, so new details are collected until the page has been quiet
  for 30 minutes (see «Follow-up posts» below). The watch ends 6 hours after Valve's announcement (owner, 22.10.2026:
  one window for the details and the price, everything is out by then).
- Price from Valve, first choice (owner, 22.10.2026: «идеально»): `https://www.dota2.com/react/getbpprices?item_defs=<id>`
  (keyless, several ids comma-separated) gives Valve's store price, e.g. `{"34454":"$4.99"}` for Trove of Terror; the
  event pages use it themselves. The currency follows the caller's country (USD from Moldova and from the owner's
  browser; no parameter changes it). A treasure's item id comes from Liquipedia's `defindex` (Treasure of Wonders
  31200, $2.49): the carnival page prices other items, not its treasure (the automaton personas `nItemID` 31367 etc.
  $14.99, Secret Room Pack 34452 $14.99, 34472 $7.99). Posts give this price in dollars as Valve returns it, no «≈» (owner,
  22.10.2026: dollars are fine; no rouble price, owner 22.10.2026).
- An event page's treasure, read by our parser (checked on dota2.com/darkcarnival, 22.10.2026): the sets in slider
  order (`{heroname:…}` in the page chunk), which is rarity from common to rarest (owner, 22.10.2026: the last slide
  is the top reward, Io «Madame Scrio» in the carnival; the treasure post's image is the last slide's), each set's image at
  `cdn.steamstatic.com/apps/dota2/videos/dota_react/<slug>/treasure/set_<hero>.png`, and the personas' item ids
  (their prices). No drop rates and no treasure price on the page. Built 22.10.2026 (`docs/backend/sources.md`):
  checked on 13 event pages of 2023–2026, texts read on 11 (not summer2023, deadreckoning), the treasure with images
  on all 5 that have one; the personas' prices too.
- Follow-up posts of an event publish themselves (owner, 22.10.2026). Each event keeps a record of the facts already
  published (sets, drop rates, opening bonuses, price, trailer); a new fact is checked against it, so nothing, the
  price above all, goes out twice. New facts wait in the event's pending set: the sets with their images are a large
  fact, the rest are small. The pending set goes out after 30 quiet minutes when it holds a large fact or at least two
  small ones, and whatever is left goes out when the 6-hour window ends. Small facts never edit an earlier post: they
  go out as one «details» post (an edit reaches nobody who read the post, and a media caption is capped at 1024
  characters). At most three posts per event: the news, the sets, the details. A price found later that differs from
  the published one gives no new post: the bot asks the owner and offers to correct the published post. Trove of
  Terror would give: news 03:22, sets with «$4.99» ~04:35 (Liquipedia's `defindex` gives the id), drop rates and
  bonuses ~08:10.
- Built 21.10.2026, to be seen by the owner on DEV: an event with its own dota2.com page (e.g. dota2.com/darkcarnival) becomes a series of posts, not one (owner,
  21.10.2026): the page's own texts — Valve's Russian translation among them (story, how it works, rewards, the
  treasure's sets, personas) — and images are read; the AI first plans the series (how many posts, one topic each, in
  a logical order, no repeats, which images go where), then writes each post; they go out spaced in time. A trailer
  is linked when the page has one. Without such a page (Trove of Terror) the post comes from the announcement.
  Built 22.10.2026 (owner: five posts were too many): at most three posts on fixed topics (the event, the new hero
  cosmetics, the treasure opening with its rarest set), photos only. Spaced 10 minutes apart and published without the owner
  when switched on; a treasure without its own page is followed on Liquipedia (above).
- Sources come in two kinds (owner, 21.10.2026): important ones, whose news the studio writes and publishes by itself
  as soon as it appears, and scheduled rubrics (e.g. a weekly «worst heroes» from a stats API). Publishing without the
  owner is decided (`docs/DECISIONS.md`, 21.10.2026: Valve posts at the owner's night). Built 22.10.2026 for single news posts (`docs/backend/sources.md` «Automatic publishing»); an event series too (migration 0100).
- Liquipedia Dota 2 as an on-demand source (owner, 22.10.2026): no Cron polling; the server fetches a page when a
  post or rubric needs it. Only the MediaWiki `api.php` (wikitext and image URLs; HTML pages are forbidden by its
  terms): at most 1 request per 2 s (`action=parse` 1 per 30 s), a `User-Agent` naming the project with a contact,
  gzip accepted; posts name no source (owner, 23.10.2026), though Liquipedia's CC-BY-SA 3.0 asks for credit. It has heroes with
  per-patch changelogs, items, patches, treasures and sets with images (no prices), tournaments, matches, teams,
  rosters and transfers. LiquipediaDB (structured data) needs an approved key and is paid unless the use is
  non-commercial; not planned.
- Patches (owner, 22.10.2026; all publish without the owner, `docs/DECISIONS.md`). Kinds, from Valve's
  `datafeed/patchnoteslist` and the Steam announcement of the day (checked on 2023–2026):
  - one post per patch, big or small (owner, 22.10.2026: «на патч можно 1 пост»): the main change first, briefly and
    with a joke when it fits (Valve's general notes: facets removed, a new mechanic, the map, modes), then who was cut
    the hardest and who was buffed, then the items that changed most, and the patch page linked for the rest. Written
    from Valve's datafeed of that version when the Steam announcement names one (7.41 «… Gameplay Patch», «Update 7.37
    Is Here», a patch with its own page like 7.38 /wanderingwaters), not from the announcement's few lines;
  - a Steam «Dota 2 Update - <date>» hotfix (no datafeed row, ~20 a year): a short post, linked to the announcement,
    only when the AI finds something a player cares about (event rewards, a hidden nerf, a funny bug), else a studio
    mark only.
  - The picture, every patch (owner, 22.10.2026: «всем чтобы была картинка, случайно»), 1536×768 (owner, 23.10.2026, instead of 1000×500 the model cannot draw): drawn by GPT from
    the owner's references (`design-refs/patch-cover/1–8.png`: the Dota logo, the number in cracked stone with a glow,
    a line, 3–4 points with icons) in a theme picked at random (lava, red, blue lightning, cyan, green, purple). The
    number and the points are given exactly: the points come from the patch data (hero changes or a new hero, item
    changes or new items, the map, mechanics, modes; «Исправления ошибок» for a hotfix), the heaviest 3–4. A second
    call reads the picture back; a number or a caption that differs means another try (at most three), then the post
    goes without a picture and the owner gets a short note.
  - Built 22.10.2026: the patch post from Valve's notes and the hotfix check; 23.10.2026: the patch picture
    (`docs/backend/sources.md` «Patch posts», «Patch picture»; its price per picture is measured on the first DEV calls).
    Seen on DEV 23.10.2026: 7.41e went out without the owner with its picture (the DEV-only «Проверить автопубликацию»), so
    the AI over Dota's sources is closed; other sources come next. Renaming a video's short name in the studio is dropped
    (owner, 23.10.2026: «мелочи», the AI's names will do).
- Find and add more that give a post a day without the owner's work; each must be free, keyless or with a free key,
  and allowed by its terms.
- First: Telegram rich messages (Bot API 10.1–10.3, 11.06–24.08.2026; grammY 1.46 supports them) tried live on DEV
  before anything is rebuilt (owner, 23.10.2026: «наши посты могут стать интереснее»). A DEV-only action sends
  samples to «Тест канал» and the owner's chat: the channel's real recent topics (a patch post, an event series post,
  a treasure follow-up, a news post, a datamine find) redone the new way — section heading, `<mark>`, a table of
  nerfs and buffs, an expandable block, photos and a collage inside; a datamine diff as classic `pre` with
  `language-diff` and as a rich `<pre><code class="language-diff">`; the daily analytics report as a rich table
  (bordered, striped, compact). No AI generation for the samples (owner): texts are taken from posts already
  published, pictures from ones already made or from the sources (Valve's CDN). The owner looks on phone and desktop;
  then we pick what posts and the report use. Open: the `<mark>` colour, red/green in `diff`, how old clients and
  channels show rich messages, scheduling (sendRichMessage has no schedule field), editing in the studio.
  Built 23.10.2026 as a DEV-only «Rich-образцы (DEV)» button on «Источники» (every post kind and the reports); removed 24.10.2026 after the owner's look. `<mark>` is never used: it has no colour attribute and on a phone in the dark theme shows white text on yellow, unreadable (owner, 23.10.2026); bold marks the key fact.
  Owner on the first look (23.10.2026): one picture per post (a collage of hero portraits looked awful); a treasure
  lists every set in the table; no English text but names; no «Источник» line and no links but «Подробнее» to dota2.com.
  Owner's review of the full set (23.10.2026), to carry into the real posts:
  - patch: the main change, then one table with group rows: the 2 heroes cut hardest, the 2 buffed most, 2 mixed
    (something taken, something given); the items in a folded block of their own (liked); our patch picture on top;
    groups marked 🔴 cut / 🟢 buffed / 🟡 both as header rows of the table, no stripes (they mixed with the groups);
  - every post stands alone for the reader: never «в отдельном посте», «дальше ещё N постов» or any reference to
    another post;
  - tables only for short cells (numbers, names); a long description goes as a bold name with its text below; short
    headers so a column does not wrap (Telegram sets column widths itself, there is no width attribute);
  - hotfix: liked as is; it needs a picture too, how to make it is to be decided with the owner;
  - event series: liked; the writer must not add «Дальше ещё N постов» (the AI wrote it, no prompt asks for it);
    several pictures of a post go in one slider (`tg-slideshow`): the five automatons on their background
    (`*_automaton_gameplay_poster.jpg`), all 15 treasure sets; never a collage;
  - treasure without its own page: news, sets and details liked; Liquipedia's set icons (256×170) look blurry in a
    slider and no larger source exists (research 23.10.2026: Workshop, dota2.com, schema, market, Fandom all ruled
    out). Rule for every fetched picture (owner, 23.10.2026): its pixel size is read from the file header; below
    the bar (800 px wide) it goes through the AI with a strict
    instruction: «ничего не меняй, не добавляй и не дорисовывай — только улучши качество» (`docs/DECISIONS.md`,
    23.10.2026: a project law). The DEV trial on 5 Trove icons came out right (owner: «идеально»), so the Trove sets
    keep their slider of improved icons; the DEV trial was removed 24.10.2026; the check runs before every source picture (`app/workflows/picture-quality.ts`);
  - news: the whole content, not a short summary of the announcement: its linked page (e.g. dota2.com/summerscrub2026,
    with Valve's Russian texts) gives the new features, the changes and the fixes by section; a second announcement
    of the same day (The International's predictions, fantasy, bundles) is its own post;
  - file find: no heading, the text opens with «В файлах игры нашли»; the diff lines are only `-`/`+` and what
    changed, no file labels like «Слот 6»; an entry that only moved is not a change;
  - reports: the first rich report was cut down and its 5-column table broke on a phone; the rich report must keep
    every part of the classic one (followers, the day, Telegram, the review, milestones) with short video names.
- Every post in the approved rich format (owner, 23.10.2026), in steps: 1) storage and sending (built 23.10.2026,
  migration 0103, `docs/backend/publishing.md` «Rich posts»); 2) the writers keep plain text in a fixed structure that
  approval turns into the sample — patches built 23.10.2026 (`docs/backend/sources.md` «Patch posts»), then hotfixes,
  event series, treasures, news; 3) the picture quality check before every source picture (built 23.10.2026, `docs/backend/sources.md` «Picture quality»;
  a treasure's sets follow-up gets its sets' icons); 4) the bot's draft preview
  and the studio (built 23.10.2026: «👁 Как в канале» under a draft; the studio shows a rich post as Telegram does; since 24.10.2026 its text is edited in the studio and the preview
  rebuilds as it is typed, a text without the structure is not saved; desktop view «Редактор / Вместе / Превью»); 5) the analytics reports as rich tables (built 23.10.2026, migration 0104: the daily and weekly reports go as
  rich messages with every part of the classic one; a refused rich message falls back to the classic one).
  Release (owner, 23.10.2026): steps 1–5 whole, checked live on DEV, then the owner's `develop → main` and production
  migrations; the studio shows a rich post and edits its text with a live preview (owner, 24.10.2026; a block editor later).
  Before the release (owner, 24.10.2026: «не может идти в прод без» it): the game-file source below, on DEV; after the
  release, on DEV: the rubrics and new sources.
  The AI money page counts only the chosen provider (OpenAI); a second API in use gets a tab per provider with its own
  spend (owner, 23.10.2026).
- Next: changes in the game's files (owner, 23.10.2026: «это очень интересное»). Source: the GitHub repo
  SteamTracking/GameTracking-Dota2 (SteamDB's tracker; one commit per game build with its file diffs), read through
  GitHub's API with a free token (the owner sets `GITHUB_TOKEN`; never steamdb.info itself, its FAQ forbids scraping).
  Research of 23.10.2026 over builds 6936–6966: game data is tracked only since 07.10.2026; English only (no Russian
  strings); `items_game.txt` (store items, sets) is not tracked. Narrow scope:
  - a Cron step polls the commit list, keeps only builds whose file list touches `scripts/npc/**` (heroes, abilities,
    items, neutral items), `resource/localization/*_english.txt`, `patchnotes/**` or `scripts/*.vdata`, and reads only
    those files' diffs, dropping noise (cosmetic-slot keys, braces, CRC lists);
  - the AI writes one Russian post per build worth it: a silent balance change, new strings of upcoming content
    (events, heroes, sets), new features; it says «в файлах игры нашли, Valve не подтверждала, может измениться»
    (owner, 23.10.2026: no SteamDB, no commit link), never quotes files (a diff is retold in Russian);
  - it goes through the automatic publishing like every source post (owner, 24.10.2026), under the same switch and
    daily limit. Built 24.10.2026 (migration 0107, docs/backend/sources.md «Changes in the game's files»); on DEV it
    starts once the owner sets GITHUB_TOKEN.
  Expected: about 1–2 posts a week outside patch weeks (07–22.10 gave: the Terrorblade arcana in the files, effect
  slots for abilities of 11 heroes, persona portraits in the hero grid, a Trove gifting notice).
- The early signal of a Dota update from Steam's product info (owner, 24.10.2026: «смотри как тут лучше и сделай на
  дев»): built on DEV (migrations 0108, 0113, `docs/backend/sources.md` «Early signal…»); a new build posts nothing itself, it has the game files read every minute for an hour; a build with nothing in it gets one short joke post, a new joke each time, with its version lines (owner, 24.10.2026).
- Idea for after the release, not chosen (owner, 24.10.2026: «после, просто как идею зафиксируй»): prices of the Dota
  market as unique content — a new arcana's or treasure's price at release and a week later, weekly top movers, all
  arcanas by price with a 30-day trend, alerts (a 30/90-day low, a drop over 20% a day), store sales and Steam's ruble
  rate. Research of 24.10.2026 (live requests, not from a Worker):
  - Steam Community Market `search/render` (`appid=570&norender=1`) works logged out: 10 items a call, USD only, tag
    filters (106 arcanas, 364 treasure chests, 1 875 immortals); 80 calls in a row passed. `priceoverview` gives RUB
    (`currency=5`) but allows about 20 calls a minute per IP; `pricehistory` needs a logged-in cookie (a grey area of the
    Steam Subscriber Agreement). No free source has Dota price history: it is built from our own snapshots in D1.
  - market.dota2.net `api/v2/prices/RUB.json` (23 000 items with volume, 1.9 MB) and lis-skins `dota2.json` as a
    cross-check; parsing them may not fit the Free plan's 10 ms of CPU.
  - Valve's store has no open catalog; `dota2.com/react/getbpprices` gives one USD price by item id; Steam Web API
    `GetAssetPrices` (owner's `STEAM_WEB_API_KEY`) may give store prices and sales — not tested.
  - Risks: Steam's per-IP limits from Cloudflare's shared egress (test on DEV first), noisy prices of thin items.
  First step when chosen: snapshot arcanas, new treasure items and the most traded immortals on DEV for a week, then pick
  the posts by the measured volatility.

## 2. Rubrics the AI runs itself

Many repeatable rubrics the AI drafts from the sources on its own schedule; the owner approves or edits. Their results
show in Аналитика → «Рубрики Telegram».

Research of 25.10.2026 (about 200 Telegram channels, sources, Telegram's features; reports in `.logs/handoff/research-*.md`):
the post's format barely moves views; an explicit ask («оцениваем», «голосуй») gives about 1.6× reactions; short
image-first channels at about 3 posts a day hold the best reach; named rubrics, polls and quizzes are almost absent in
Dota channels, and so are plain-Russian patch breakdowns and game-file finds.

Chosen with the owner (25.10.2026): the game only, no esports for now; giveaways are the owner's own, by hand.
Every interactive post stands alone, at most one a day and 3–4 a week; a poll always closes (`open_period`), and a
rubric with few participants pauses itself.
- Step 1, from data we already have:
  1. «Что сломали в патче»: after a patch, who was buffed or killed, then the next day a poll «Кто теперь имба?».
  2. «Оцениваем»: a reaction vote on a new set, arcana or hero change.
  3. «Чей сет?»: a treasure set's image without the hero, a quiz poll with four heroes and the answer inside the poll.
  4. «Угадай героя по способности»: a quiz poll from the game files.
- Step 2, from OpenDota and Steam (free, no key; checked 25.10.2026): «Мета недели» (who rose and fell by winrate),
  «Баттл героев» (an A-or-B poll for 24 hours), Dota's online records and a new #1 on Valve's leaderboard, item
  timings and counters (what Dota2ProTracker and Dotabuff show; both forbid scraping and have no API).
  «Оцени сет из мастерской» (owner, 25.10.2026: «если появились там»): a set that has just appeared in the Steam
  Workshop and is rising there goes out for a rating with a link to its Workshop page (owner, 25.10.2026), at most
  twice a week (Steam Web API `QueryFiles` with the
  owner's `STEAM_WEB_API_KEY`; not checked yet).
  «Кто кого перебьёт?» (owner, 25.10.2026): two heroes, each with six items, on one picture; an A-or-B poll and the
  comments («я бы добавил…»). The builds come from OpenDota's popular items per hero; the picture is composed from
  Valve's real hero and item icons, never AI-drawn (a drawn icon would be wrong); how to compose it for $0 (e.g.
  Cloudflare Images overlays on the free tier) is checked first.
- Later: «Какой ролик снять?» every two weeks (the owner films the winner). STRATZ (the only free source for the
  Immortal bracket) needs the owner's sign-up.

## 3. News

Claude was compared blind with OpenAI on 13 writer tasks (21.10.2026): the writer stays on OpenAI (`docs/DECISIONS.md`); the comparison was removed afterwards, the result and the reference are in `docs/ai/claude-provider.md`.

The AI turns new source events into news posts in the owner's voice: what happened, why it matters to a player.

## Next: video

Once 1–3 are done (owner, 20.10.2026): video. Planned with the owner when it starts.
