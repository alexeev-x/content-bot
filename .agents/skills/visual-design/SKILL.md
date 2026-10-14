---
name: visual-design
description: "Visual direction for the admin UI: grounding in the subject, token plan before code, avoiding generic AI-looking defaults, restraint, type scale, motion, Russian interface copy, screenshot self-critique. Use when creating or restyling tokens, primitives or screens."
---
# Visual design for an operator tool

Adapted from Anthropic's `frontend-design` skill (Apache-2.0, see `references/sources.md`) for a daily-use admin, not a marketing page. The goal is calm, dense and legible, with one deliberate signature, and never a template look.

## Ground it in the subject
The product is a content-operations desk for a Telegram channel about Dota 2: an operator schedules posts, watches their delivery and resolves incidents, often from a phone. Distinctive choices come from that world: the rhythm of a publication schedule, the states of delivery, the clarity of a mission-control status board. They do not come from generic SaaS cards.

## Plan before code (two passes)
1. Write a compact plan:
   - Color: 4–6 named base values mapped to the semantic tokens.
   - Type: one family, or two clearly different ones, with a scale and their roles.
   - Layout: a one-sentence concept plus an ASCII wireframe for 375, 1280 and 1920 px, with alignment.
   - Principles: 2–3 rules that make this UI specific.
2. Review the plan against the brief. For each part that is a generic default you would produce for any admin, revise it and say what changed and why. Only then write tokens and code. The owner's explicit choices always win.

## Defaults to avoid unless chosen on purpose
These are the common tells of generated UIs:
- A near-black tinted background (#0B0B0B, #111) with a single acid-green or vermilion accent.
- A SaaS card kit: identical rounded cards, one radius on everything, the same soft grey shadow, gradient washes.
- Template chrome: an ALL-CAPS tracked eyebrow above every heading, meta joined with « · », a monospace face for small labels, «→» appended to buttons, numbered markers on content that is not a sequence, one highlighted word in a headline.
- A fade-and-slide entrance on every section and a hover animation on every card.

## Approved direction (14.10.2026): Cloudflare-dashboard look
Binding: `docs/design/README.md` (references in `design-refs/нравится/`) and `docs/design/UX_SPEC.md` for flows. One accent token set (cobalt default; per-theme presets or a custom color from Settings → Appearance) only for primary actions, selection, focus, links and charts. Statuses keep their own colors plus text and icon. Refine this direction; never propose a new one. Components are React Aria Components wrapped in `shared/ui`, styled with CSS Modules over the tokens; add no other UI library.

## Principles
- **Spend boldness in one place**, for example the publication timeline or the status system. Keep everything else quiet. Before finishing, remove one decorative element.
- **Structure is information.** Borders, dividers, numbering and labels must encode something real: hierarchy, grouping, sequence or state.
- **Type carries the personality.** Use a deliberate scale with few sizes and clear weights. Body lines stay under 80 characters. Use tabular figures for times and counts.
- **Density with air:** a consistent spacing scale, and alignment to a grid. Tables are the core surface, so make them excellent rather than wrapping data in cards.
- **Motion** only answers an action (open, expand, confirm, a status change) and respects `prefers-reduced-motion`.
- **Quality floor**, met without announcement: responsive to 375 px, visible focus, contrast per skill `visual-check`, and states per skill `page-spec`.
- **CSS:** keep specificity flat (CSS Modules plus `@layer reset, tokens, base, components, utilities`). Don't let section and element selectors fight over padding and margin.

## Interface copy (Russian)
- Name things in the operator's words, not the system's: «Каналы», not «Destinations config».
- A button says exactly what happens, and the outcome keeps the same verb: the button «Запланировать» leads to the status «Запланировано»; the button «Отменить публикацию» leads to «Отменено». Status labels come from the mapping in skill `page-spec`.
- Sentence case, plain verbs, no filler. Errors say what happened and how to fix it; they don't apologize and are never vague. An empty state invites the next action.

## Self-critique
Take screenshots (skill `visual-check`) and look at them as the operator would at 07:00 on a phone. Ask: is the most important state obvious in one glance? Is anything decorative without meaning? Would this pass as a different product with the logo swapped? If yes, revise.
