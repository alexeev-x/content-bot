# ALEXEEV — design in code only

**Owner decision 03.10.2026: Figma is not needed at all.** Exclude Figma tasks, exports, licenses and handoff. Single source of truth: `apps/frontend/src/app/styles/tokens.css`, `apps/frontend/src/shared/ui`, and the pages and their states in the repository.

## Latest visual direction (owner decision 07.10.2026)

The primary external visual/UX orientation is now **Cloudflare Dashboard**: calm operational density, restrained dark surfaces, thin borders, compact controls, structural skeletons that preserve final geometry, collapsible navigation/panels, data-first tables and command-style search.

Canonical design guidance (approved 08.10.2026) lives in **[`docs/design/README.md`](design/README.md)** and **[`docs/design/UX_SPEC.md`](design/UX_SPEC.md)**; the clickable prototype is at `/__proto` (dev-only).

Where the older “Modern SaaS” prototype below conflicts with the newer direction in visual mood, glow, card treatment, density, skeleton behavior or navigation collapse, the **07.10.2026 Cloudflare-oriented direction wins**. Existing semantic tokens, accessibility requirements, statuses and real product behavior remain authoritative until deliberately changed in code.

Important correction: the prototype contains demo labels. **AI/LLM product functionality is not in current scope** and must not be inferred from any demo content.

## Designer artifacts
1. `tokens.css`: semantic colors, type scale, spacing, radius, elevation, motion, breakpoint usage; light/dark and Telegram theme mapping where needed.
2. Primitives: Button, Input, Select, Dialog, Toast, StatusBadge, Table, Tabs, and error/empty states. A component has public props, keyboard behavior, and loading/disabled/invalid examples.
3. `docs/PAGE_MAP.md`: routes, actions, loading/empty/error/401/403/409/unknown states and mobile layout.
4. Screenshot acceptance reference from a real browser render, Playwright diff on stable fixture data.

## Handoff to frontend
For substantive UI: UX Designer → UI Prototyper (clickable code-native mock using `/__proto`) → independent UI QA → Frontend → independent UI QA. Design System joins only for missing shared tokens/primitives. Lightweight changes may skip the mock gate. See `docs/AGENT_UI_WORKFLOW.md`. Never require Figma or an image export; screenshots are for reference/evidence. Do not use random hex values in each feature. The accent is always a token (`--color-accent*`), switched per theme by the appearance setting; features never hard-code it.

## Quality
Contrast and keyboard access per WCAG 2.2 AA as a target; focus, aria, Telegram Mini App safe areas, responsive layouts across phones, tablets, laptops and desktops (320-1920 px+), reduced motion, touch target sizes. Verify the full viewport matrix and no-overflow/layout integrity defined in `docs/design/UX_SPEC.md` §1. Screenshot diff complements semantic tests but does not replace them.

## Executable artifacts (for agents)
The `design-system` role (`.agents/roles/design-system.md`); visual direction — skill `visual-design` (adapted from Anthropic `frontend-design`); interaction patterns — skill `ui-patterns`; page specification — skill `page-spec`; visual verification — skill `visual-check`. Visual direction: § Approved visual direction below. The UI library will be chosen separately. Component catalog — the dev route `/__catalog` with all primitive states (no Storybook, so that screenshots and axe check the same components as in the product). Component styles — CSS Modules, only via tokens.

## Density revision (owner decision 06.10.2026, supersedes parts of option C below)
A work tool, not a showcase. Where this section conflicts with "Approved visual direction" below, this section wins. Fonts, accent presets, statuses, the mobile bottom bar and 44 px mobile targets stay as they are.
- **Sidebar** 210–220 px: one flat list without group headings, «Настройки» pinned at the bottom next to the account (owner decision 07.10.2026), collapsible to icons with tooltips. The active item is a thin accent mark plus a very light background, not a filled accent block.
- **Accent** on about 5% of the interface: the primary action, focus, the selected item and charts. No large accent fills.
- **Desktop density** (fine pointer only): fields 34–36 px, table rows 48 px (raised from 40 at the owner's request, 07.10.2026), radii 7–9 px. Everything clickable shows the pointer cursor. Touch and the Mini App keep targets of at least 44 px.
- **Fewer cards.** Tables are a working surface with thin dividers. Content is fluid: tables and operational screens use almost the full width, while the editor keeps a comfortable text measure with an inspector on the right.
- **Composition per page:** Posts like a spreadsheet or database; Editor as a document plus inspector; Publications as a dense table plus drawer; Settings as two-column master/detail without large cards; Dashboard as «Сегодня», with 3–5 decisions, the next publications and one main signal, and no wall of KPI tiles.
- **Entity navigation:** the post page carries tabs «Текст · Публикации · История»; more tabs (assets, analytics, comments) appear only when their data exists. War Room, Radar, Video Studio and Analytics compositions are future direction; no empty screens are built for them.

## Approved visual direction (owner decision 06.10.2026)
Reference: `docs/design/studio-reference.html` (open in a browser; static prototype with example data, not product code; `?theme=light|dark`, `?accent=cobalt|indigo|copper|orchid|mono`) and its screenshots `docs/design/studio-{dashboard,editor}-{light,dark}.png` (1280 px, accent cobalt). Chosen from three live options (editorial, control room, modern): **option C "modern"** with the **cobalt** accent. Rejected: the editorial serif look, the dark instrument-panel look, the lime accent.

**Look.** Soft surfaces, rounded cards with a light shadow, sticky blurred top bar, left sidebar on desktop composition and a bottom tab bar (4 items + «Ещё» sheet) in compact widths below 860 px; KPI tiles with small sparklines on the dashboard; the editor shows the form next to a sticky live Telegram preview only when space permits; the publication detail is a drawer (full-screen sheet on compact widths) with the attempts timeline and the manual reconciliation choice. Tables become cards when columns do not fit, the week calendar becomes a day agenda when needed. Layouts support phone, tablet, laptop and desktop widths; targets ≥ 44 px for touch/mobile.

**Type.** Onest (UI, Cyrillic) — headings weight 650, letter-spacing −0.02em; JetBrains Mono for times, ids, revisions and counters (tabular numerals).

**Shape and space.** Radius 8 / 12 / 18 px and pill; spacing 4 / 8 / 12 / 16 / 20 / 24 / 32 px; motion 120 / 200 ms, off under `prefers-reduced-motion`.

**Accent.** One accent, used only for primary buttons, the selected navigation item, the focus ring, links and sparklines. Status colors never depend on it.

| Preset | Light: accent / on-accent / accent text + ring | Dark: accent / on-accent / accent text + ring |
|---|---|---|
| `cobalt` (default) | `#1D4ED8` / `#FFFFFF` / `#1D4ED8` | `#6C93FF` / `#06112E` / `#9DB8FF` |
| `indigo` | `#4F46C8` / `#FFFFFF` / `#4F46C8` | `#8F88F2` / `#110F2B` / `#B0AAFF` |
| `copper` | `#B4531C` / `#FFFFFF` / `#A04512` | `#E58A4E` / `#1F0E03` / `#F2A674` |
| `orchid` | `#B0206F` / `#FFFFFF` / `#B0206F` | `#E879B9` / `#2A0518` / `#F59AD0` |
| `mono` | `#14170F` / `#FFFFFF` / `#14170F` | `#EDEFE9` / `#0D0E0C` / `#EDEFE9` |

Custom presets (Settings → Appearance, up to 10): one base color + a name; the light/dark accent shades are derived from it with lightness adjusted to keep WCAG AA for on-accent text and the focus ring; a warning (not a block) when the hue is close to the failed or unknown status colors.

**Statuses.** Pill = icon + text + tinted fill + 1 px ring; color is never the only signal. Labels and the status → token mapping are canonical in skill `page-spec` (the prototype uses illustrative labels). Hues: failed red, unknown amber, retry cyan, sent green, others neutral; with cobalt/indigo the «sending» pill is neutral slate, with copper «unknown» moves to gold — the prototype CSS holds the exact values per theme.

**Neutrals.** The prototype neutrals carry a slight green tint chosen for the rejected lime accent; retune their hue bias to neutral/cool for cobalt when moving them into `tokens.css`, keeping the same contrast steps.

Deviations from this direction need an owner decision; refine values in `tokens.css`, not per feature.

## Token layer as built (`apps/frontend/src/app/styles/tokens.css`)
- Selection by attributes on `<html>` (or any wrapper): `data-theme="light|dark"`, `data-accent-light` / `data-accent-dark` = `cobalt|indigo|copper|orchid|mono|custom`. No attributes = dark + cobalt. `custom` reads `--custom-{light,dark}-{accent,accent-hover,accent-text,accent-soft,on-accent,focus-ring,accent-glow}`, which `src/app/theme.ts` injects from `shared/lib/color` `deriveAccent` (lightness moved until on-accent ≥ 4.5:1, accent text ≥ 4.5:1 and focus ring ≥ 3:1 on every surface of the theme). `applyAppearance()` applies it; the last appearance is cached in `localStorage` (`ui-appearance`, `ui-theme`) and replayed before React renders; the server setting stays the source of truth.
- Colors: `--color-bg`, `--color-surface-1|2|3`, `--color-border-subtle|strong`, `--color-text`, `-muted`, `-disabled`, `--color-danger`, `--color-scrim`, `--color-grid`; accent `--color-accent`, `-hover`, `-text`, `-soft`, `-glow`, `--color-on-accent`, `--color-focus-ring`; status `--color-status-{pending,active,done,retry,failed,unknown,muted}-{fg,bg,ring}`; Telegram preview `--color-chat-bg`, `--color-bubble`, `-text`, `-meta`, `-link`; shadows `--shadow-card` (now `none`: cards are a border only), `--shadow-pop`; `--color-selected-bg` (neutral, the selected row or nav item; the accent shows only as a 3 px mark). The sidebar selection mark uses `--color-accent` directly.
- Scales: `--font-body|mono`, `--font-size-2xs|xs|sm|md|lg|xl|display`, `--font-weight-*`, `--letter-spacing-heading|display`, `--space-1..8` (1,2,3,4,5,6,8), `--radius-1|2|3|pill` (7/8/9/999, density revision; the old 8/12/18 are gone, names kept), `--size-target` 44, `--size-target-min` 24, `--size-control` / `--size-control-sm` / `--size-row` / `--size-topbar` (fine pointer 36/30/48/48 px; under `(pointer: coarse), (max-width: 859px)` 44/44/52/56 px), `--size-sidebar` 216 and `--size-sidebar-collapsed` 56, `--measure-reading` 760 (the `.reading-width` class opts a page into it; content is fluid otherwise), `--motion-fast|base` (0 under reduced motion), `--z-sticky|nav|overlay|modal|toast`.
- Deviations from the prototype, with reasons: neutrals retuned from green tint to cool grey (hue ~265) for cobalt, same lightness steps; dark `--color-border-strong` raised to `#747a86` because the prototype's `#4a5045` was 2.2:1 and input borders need ≥ 3:1; `--color-status-pending-*` is the prototype's «scheduled» pair; custom accents always use the slate «active» status. `tokens.test.ts` measures every preset and status from the real file.
- Fonts: Onest and JetBrains Mono are self-hosted through `@fontsource-variable/*` (Cyrillic subsets, bundled by Vite). The CSP `default-src 'self'` stays unchanged, no third-party font request.
- `/__catalog` (dev only, 404 in production) shows all tokens in both themes; the route file is `routes/[_][_]catalog.tsx` because TanStack Router treats a leading `__` as a pathless layout.
