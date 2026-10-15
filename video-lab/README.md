# video-lab

A test of AI editing for the owner's Reels: the two reference videos re-cut with Remotion on their original
voice-over. Separate from the studio; nothing here is deployed.

- `renders/` — the results: `bkb-recut.mp4` («Учу фидить»), `oracle-recut.mp4` («Учусь играть, часть 69»).
- `analysis/<video id>/` — the breakdown of each reference: `speech.srt` and `words.tsv` (speech with
  timestamps), `cuts.txt` (cut times), `sheet.png` (one frame a second), `stills/` (one frame per shot).
- `public/` — sources and assets cut from the references (renders, icons, logo).
- `src/engine/` — the reusable template: shots (gameplay clip, text card, image) and captions on one
  timeline; `src/edits/` — one edit decision list per video.

Run: `scripts/setup.sh` once, then `npm run studio` (preview in the browser) or `npm run render`.
Limits of this test: the voice and the gameplay come from the finished videos (no separate tracks), so the
captions burned into the Oracle gameplay are hidden under a blur strip.
