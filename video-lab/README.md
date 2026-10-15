# video-lab

A test of AI editing for the owner's Reels: the two reference videos re-cut with Remotion on their original
voice-over. Separate from the studio; nothing here is deployed.

- `renders/` — the results. `*-recut.mp4`: v1, the original edit rebuilt. `*-v2.mp4`: v2, only the owner's voice
  kept and the rest edited from scratch for retention (a new picture every 1.5–3 s, word-by-word captions,
  official Dota renders and icons, sound effects, camera hits, a progress bar).
- `analysis/<video id>/` — the breakdown of each reference: `speech.srt` and `words.tsv` (speech with
  timestamps), `cuts.txt` (cut times), `sheet.png` (one frame a second), `stills/` (one frame per shot).
- `public/` — sources and assets cut from the references (renders, icons, logo).
- `src/v2/` — the v2 engine: beats (hero render, icons, gameplay, slam, versus, Telegram poll), captions built
  from word timings, sound effects; `src/v2/cuts/` — one cut per video. Voice and music were split from the
  finished videos with demucs (`.venv`, Python 3.12 via uv); renders and icons come from the dota2.com CDN.
- `src/engine/` — the v1 template: shots (gameplay clip, text card, image) and captions on one
  timeline; `src/edits/` — one edit decision list per video.

Run: `scripts/setup.sh` once, then `npm run studio` (preview in the browser) or `npm run render`.
Limits of this test: the voice and the gameplay come from the finished videos (no separate tracks), so the
captions burned into the Oracle gameplay are hidden under a blur strip.
