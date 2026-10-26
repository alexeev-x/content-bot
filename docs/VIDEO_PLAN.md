# Video plan (Shorts / Reels)

Written 26.10.2026 with the owner. Nothing here is built yet. A local prototype of one «Учусь играть» episode (69, Oracle)
was rendered on 26.10.2026 to show the look; it is not in the repository. Research behind the choices:
`.logs/research/video/` (engine, captions-director, motion-style, agents-github).

## Goal

The owner uploads a voice recording and gameplay clips, gets a finished 9:16 video in the rubric's style and schedules
its publication. Motion graphics must look hand-made (After Effects level), not like a generic AI video.

Owner choices (26.10.2026), to be recorded in `docs/DECISIONS.md` when work starts:
- Remotion (React) compositions; preview in the admin with the Remotion Player; final render in the owner's browser
  (`@remotion/web-renderer`), so no server render and no money.
- No After Effects anywhere in the pipeline, not even AE → Lottie.
- Elements are our own components placed by rules from the voice's words; no AI-written code per video. An AI director
  may come later if rules are not enough.
- One rubric at a time; every repeated element is approved by the owner (≤ 3 variants on the same frames).

## Pipeline (all rubrics)

| # | Stage | Done when |
|---|---|---|
| V0 | **Research and references** (below) — no production code, only boards, samples and an animatic | the owner picked caption styles, a layout and element styles to build |
| V1 | **Rubric kit «Учусь играть»** — the repeated elements (below), built and judged on local renders | the owner approved each element on real frames |
| V2 | **Second episode type of «Учусь играть»** (mechanics) | approved like V1 |
| V3 | **Intake** in the admin: voice (mp3/m4a/wav, new audio intake — the media library takes no audio today) and gameplay as one cut file up to ~1 min or several pieces; the owner's verdict clip; episode number, hero or mechanic, linked AI script | files load in the browser without uploading the raw gameplay |
| V4 | **Words with timings**: a transcription provider chosen by a test on 3 of the owner's recordings (candidates: Cloudflare Workers AI Whisper, Groq Whisper, Voxtral; local whisper.cpp large-v3-turbo was accurate on the prototype), then aligned to the script text | captions need ≤ 2 manual fixes per video |
| V5 | **Editor**: voice trim on a waveform (reuse `VideoTrimTimeline` and Mediabunny), cut a middle part, edit a caption word, turn an element off or move it, clip order, preview | all of this without code or prompts |
| V6 | **Render** in the browser to H.264 mp4, upload the result to R2 | a 60 s video renders on the owner's PC; speed and memory measured first |
| V7 | **Publish**: YouTube upload as private with a publish date (owner's explicit action per video, decision 13.10.2026); TikTok later (its API needs an app audit) | a scheduled Short appears at its time |
| V8 | **Rubric kit «Учу фидить»** | approved like V1 |

Rules for every stage: cuts snap to word boundaries; times map source → kept segments → timeline piecewise (never shift
all words by one constant); captions and element triggers follow the mapping; music ducks under the voice.

## V0. Research and references

Before building any element, the owner sees what is possible and picks. References are studied for principles, never
copied. Boards and samples go to `design-refs/video-uchus-igrat/`; research notes to `.logs/research/video/`. Limits per
agent brief: ≤ 3 variants per question, ≤ 2 fix rounds, one contact sheet per review.

| # | Research | Covers | Deliverable |
|---|---|---|---|
| R1 | **Captions in gaming Shorts** (Dota, LoL, CS, other games; RU and EN creators) | word-by-word colour change, a block or box behind the active word, karaoke sweep, a pop per word, plain 1–2 lines that just change, a light fade or slide, accent words only, stroke vs. plate, emoji; font with Cyrillic, size, position, words per page | a board of real screenshots with sources; every style as a 3–5 s sample on the frames of episode 69 |
| R2 | **Composition of a gameplay Short** | full-frame crop, crop with header and footer zones (today's), blurred letterbox, gameplay in a card with margins, split screen; where the header, captions and elements sit; the platforms' UI safe zones | a board; 3 layout stills on our frames with the safe zones drawn |
| R3 | **Elements over gameplay** | skill, combo and item cards, stamps, counters, punch-ins, transitions, sound accents in gaming Shorts | a board; the strongest devices listed with where they fit our beats |
| R4 | **Animatic** | the picks of R1–R3 in sequence: reference stills and our frames with simple motion, 30–45 s, voice of episode 69 | one rough video to agree on the look before V1 |

## Rubric «Учусь играть в Доту»

Format: `docs/ai/pack/format-uchus-igrat.md`. Today's videos (parts 51 and 69): a 2 s intro sting first, then gameplay
(a centre crop of 16:9 with the HUD) with small one-line captions on a black box, a hero art with a Gaben medal verdict,
a screenshot of the Telegram poll, «подпишись». No graphics over the game, so 40 s look the same.

### Repeated in every episode
| Element | What it is |
|---|---|
| Background | the owner's `grid.mp4`, 10% opacity, scaled 150% to 1080×1920 |
| Header | hero (or mechanic) icon, «Учусь играть в доту», «Часть N · Hero», death counter, progress bar |
| Captions | the rubric's own style: font with Cyrillic (Anton has none), 1–3 words a page, active word highlight, accent words; position on the game or below it is a template setting, decided by test |
| Music | the constant track `D:\канал\аудио\bg.mp3` (owner), ducked under the voice |
| SFX | 3–4 house sounds: card in, death stamp, punch-in, poll (to choose; `габен клик` is a joke clip, not a sound) |
| Ending | the owner's verdict clip → poll card «кто следующий» → the intro sting moved to the end → «подпишись» |

### Episode type A — about a hero
| Beat (format) | Element | Trigger and data |
|---|---|---|
| 1. Hook: a personal fail or absurd remark in 3–5 s | hero card (art + name as players say it) and a punch-in | first seconds; hero from the episode |
| 2. Expected vs. real | «КАЗАЛОСЬ / НА ДЕЛЕ» split | words like «думал», «оказалось» |
| 3. 2–4 mechanics through experience | ability card (icon + Q/W/E/R key); combo card («УРОН = E + Q»); item icon (crossed out for «ни разу не покупал») | ability names, ordinals («третий»), owner's slang («лазер», «яйцо»), item names; icons and keys from the Valve datafeed |
| 4. The main difficulty or fail | death stamp «☠ УМЕР», counter +1, short freeze-frame | «умер», «порвали», «разнесли», «убили» |
| 5. Personal verdict | the owner's own verdict clip (hero art with the Gaben medal, animated by hand), uploaded with the episode | placed at the closing sentence |
| 6. Next hero / «голосуй в ТГ» | an animated «голосуй в ТГ» card (an animation, not the real poll: the Telegram poll may run at any time) | the closing sentence |

### Episode type B — about a mechanic (pulls, stacks, a role or item)
| Beat (format) | Element | Trigger and data |
|---|---|---|
| 1. What I found or didn't get | topic card (mechanic name + icon) | first seconds |
| 2. What happened to me | game-clock timer («:53 — тяни») | times said in the voice |
| 3. 1–2 takeaways | minimap callout with an arrow; numbered steps «1 → 2 → 3» | words «сначала», «потом», places on the map |
| 4. Question to the audience | verdict «освоил / не освоил» and poll card | the closing sentence |

Shared across both types: memes from the owner's library (`D:\канал\видео\нарезки`), placed by the owner in the editor.

## Rubric «Учу фидить в Доту»

Format: `docs/ai/pack/format-uchu-fidit.md`. The pseudo-expert's harmful advice; the look should feel «official» and
overconfident. Elements to design at V8:
| Beat (format) | Element |
|---|---|
| Hook: intrigue or a controversial claim | big claim card |
| A nearly reasonable wrong argument | «АРГУМЕНТ 1» |
| 2–3 more, each more absurd | argument counter 2, 3 with rising intensity |
| Blame shifted to the support, team, enemies or Gabe | «ВИНОВАТ: …» stamp |
| Finale: a pseudo-wise law or teaser | «ЗАКОН» plaque |
Its own intro sting (`учу фидить.mp4`) moves to the end as well.

Standalone Reels are not planned yet.

## Open questions for the owner
- Raw sources for the next prototype: the voice from Premiere's captured audio and the gameplay cut from OBS.
