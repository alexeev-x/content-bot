---
name: poster-craft
description: "Checkable rules for rubric pictures (1536×768 HTML/CSS posters with Valve's images): composition, type, colour, images, and a self-review that catches the AI-made look. Use when designing or reviewing a rubric picture."
---
# Poster craft

Distilled from public design skills (sources and licenses: `references/sources.md`). Owner decisions win over any rule here; they are listed first so they are never "fixed".

## Owner exceptions (26.10.2026)
- One red word in the title is allowed: exactly one, the only accent in the title.
- A huge bold condensed title (Oswald, caps) is allowed; keep its line-height ≥ 0.86 only where the poster look needs it and nothing overlaps.
- Portraits: 16:9, 10 px radius, one 1 px light border; no shadow, no second frame.
- Heroes always with a background; no names or ▲/▼ that the post's table carries.
- A rubric with no layout of its own may use the model's scene; every other picture is code only.

## Composition
1. One focus: the title or the heroes; everything else is quieter.
2. Asymmetric, aligned to edges and to each other; not "centred block with equal margins all round".
3. Margins ≥ ~70 px (5%); nothing touches the edge unless it bleeds on purpose.
4. Nothing overlaps or leaves the canvas: check every element's box, `overflow:hidden` is no excuse.
5. Little text: title, the patch or rank, numbers. ≤ 4 text blocks.
6. Sizes and gaps from one declared scale (e.g. 172/110/48/24 and 8/14/24/40/64), never "felt right" values.
7. Every line, frame, fill and image must carry information: remove it and ask what was lost; nothing → keep it out.
8. No empty band over ~15% of the height; fewer items re-layout, not just float.
9. No 01/02/03 numbering unless it is a real ranking.

## Type
10. ≤ 2 families, ≤ 3 weights; tracking 0…−0.015em on a condensed display face.
11. Small labels ≥ 18 px on the 1536 canvas; no tracked caps labels wider than 0.08em except one short tag.
12. Numbers `tabular-nums`, big numbers on one baseline with their units.
13. No "A · B · C" meta lines, arrows "→", emoji as icons, gradient text.
14. Fonts really loaded: in the render, not just in CSS (`document.fonts.check`); a fallback font is a bug.

## Colour
15. 60/30/10: near-black ground (not pure `#000`), light text, one red accent tied to meaning (nerf, worst, answer).
16. Red covers a small area (≈ ≤ 5%); one hue of red per picture.
17. No glows, coloured shadows, purple-blue gradients, glassmorphism; a background gradient only within one hue.
18. One temperature for neutrals; text contrast ≥ 4.5:1 (large ≥ 3:1), measured.

## Images
19. Valve's real images only (`heroes/`, `heroes/crops/`, `items/`, `abilities/`); never drawn or generated faces, never stock.
20. Never stretch an image past ~2× its size; say when it will look soft.
21. Crop with `object-position` per image kind (cut-out crops: 50% 25%); faces never cut at the eyes.
22. No text on a busy part of an image; put it on the ground or a calm area.
23. One frame language for the whole series; no card inside a card.

## Self-review (on the PNG, never on the code)
24. Render with `node .agents/scripts/rubric-preview.mjs <key>`; look at full size and at ~400 px (the phone feed).
25. Squint: shrink to 25%; the focus and hierarchy still read, the weights are not flat.
26. Silhouette: at 200 px it reads as this series, not as any template.
27. Score 1–5: hierarchy, specificity ("could only be ours"), restraint (what was removed), execution. Any < 3 → redo.
28. Blockers: overlap, out of canvas, unloaded font, soft or cropped face, wrong number. Any blocker → redo.
29. Remove one decorative element before handing over.
30. Clone check: if it could be mistaken for one reference, drop the borrowed trait.
31. Series check: next to the other rubrics' pictures, margins, frames, radii and type agree (or the difference is the rubric's intended one).
32. Numbers and facts only from the data; never rounded or invented.
