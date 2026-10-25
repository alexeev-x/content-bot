# Rubric pictures: the one style

The owner's ten references (25.10.2026, made in ChatGPT) set the look of every Telegram rubric picture: a dark cinematic
Dota 2 world (ruins, red Dota banners, torches, embers, mist), silver serif titles with one red word, ornate dark frames
around heroes, items and abilities, the small «ALEXEEV» mark on top (never «ALEXEEV STUDIO»), a red Dota logo below.

1, 3, 5–9 are the cinematic variant; 2 and 10 the poster one. The image model gets all ten, in this order, with the
style text in `apps/backend/src/modules/ai/rubric-picture.ts`; the downscaled copies are
`apps/backend/src/modules/ai/rubric-style-refs.generated.ts` (regenerate it when an image here changes).
