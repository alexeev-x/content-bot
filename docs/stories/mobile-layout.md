# Mobile layout: the admin SPA inside the Telegram Mini App

Status: audit + spec for review (UX). Expert review, not validated with users. Owner words: «адаптива вообще нету никакого!», «мы же открываем канал в телеге через телефон и там вообще ужасно все».

Method: `develop` HEAD served by `npm run dev -w @alexeev/frontend`, API mocked with Playwright routes (fixtures with long titles), Chrome with `isMobile`, 375x812 and 390x844, light and dark. Screenshots (not committed): `.logs/mobile/<screen>-<375|390>-<light|dark>[-full].png`, metrics `.logs/mobile/findings.json`. NOT verified: real Telegram client (header, safe areas, keyboard, vertical swipe) and the owner's phone; behaviour there is from the Telegram docs and code reading. Also check that the owner's phone runs the current `dev` deploy: the responsive shell (`AppShell.module.css`) landed in the last feature commit; an older build has none.

## 1. Verdict

A responsive shell already exists on `develop` (bottom tab bar below 860px, cards instead of tables, bottom sheets, safe-area padding). The owner's "terrible" is explained by a few concrete defects that break whole screens, plus missing Mini App integration. Root cause of the worst: one overflowing element widens the page, mobile Chrome/WebView then shows a shifted view and every fixed layer (drawer, tab bar) is misaligned.

## 2. Audit (severity 0 none ... 4 unusable)

Horizontal scroll check (`scrollWidth` vs `clientWidth`): only `/publications` fails (407 vs 375, both widths, both themes). Other routes: no page overflow.

| # | Screen | Defect | Sev | Evidence |
|---|---|---|---|---|
| M1 | Publications list | Cards are wider than the screen: right side of status badge, channel, time cut off; filter selects 398px wide. Page scrolls sideways. Cause: `.card`/`.list` are grids with default `auto` track and a `nowrap` title `max-width:36ch` inside; grid items cannot shrink. | 4 | `publications-375-light.png`; `DataTable.module.css:96-110`, `PublicationTable.module.css:1-8`, `PublicationsPage.module.css:3-8` |
| M2 | Publication drawer | Opens from a card on the overflowing page: left 32px of header/body/footer are clipped (title flush to edge), footer buttons below the fold. Fixed by M1; re-verify. Also a full-height side panel, not a sheet; footer is pushed under the dock. | 3 | `publication-drawer-375-light.png`; `Drawer.module.css:98-110` |
| M3 | Publication drawer | Pipeline step label «Запланировано» breaks mid-word («Запланирова/но»). | 2 | same shot; `PublicationPipeline.module.css` |
| M4 | Appearance | Theme segmented control has 3 options but fits 2.4: «Тёмная» is cut off and reachable only by hidden horizontal scroll. Controls with scroll inside look broken. | 3 | `appearance-375-light-full.png`; `SegmentedControl.module.css:1-12,18-30` |
| M5 | Appearance | Sticky save bar at the bottom of a 5100px page; 5 accent options per theme stacked as full-width rows (long scroll to the preview and the save button). | 2 | `appearance-375-light-full.png` |
| M6 | Post editor | Sticky action bar (Save/Approve, ~100px) sits above the 64px tab bar: ~170px of 812 is permanent chrome; with the keyboard open (visible area ~300px) the textarea has almost no room. Not testable in headless; code has no keyboard/`visualViewport` handling. | 3 | `post-edit-375-light.png`; `PostEditor.module.css:80-110`, `AppShell.module.css:257-275` |
| M7 | Post editor | Title is a one-line input that truncates a long title; page also repeats the title as a 4-line `h1`. Back link «Все посты» is a 24px-high target. | 2 | `post-edit-375-light.png`; `BackToPosts.tsx`, metrics: `A` 90x24 |
| M8 | Top bar | Persistent bar (logo, DEV, search, owner menu) costs ~60px on every screen; inside Telegram it comes on top of Telegram's own header. The owner menu «...» is a faint glyph; search has no label on phone. | 2 | `dashboard-375-light.png`; `AppShell.module.css:218-232,333-352` |
| M9 | Add channel dialog | Works as a full-screen sheet with sticky footer. Warning with steps is cut by the footer until scrolled (acceptable, scrolls). No defect beyond a duplicate «Добавить канал» (title and button). | 1 | `channels-add-checked-375-light.png` |
| M10 | Posts list / Channels | Fine as cards; filters are a 3-segment control that fits. Native checkbox/radio inputs measured 13px but sit inside 44px labels (no defect). | 0 | `posts-375-light.png`, `channels-375-light.png` |
| M11 | Dashboard, Calendar, Automations, Media, Incidents | Dashboard is a single placeholder card (empty 70% of screen); other routes are «in development» stubs. | 1 | `dashboard-375-light.png` |
| M12 | Tab bar | 5 equal columns; «Публикации» label nearly touches neighbours at 375px (11.5px font). Badge dot on «Ещё». OK otherwise, 48px targets. | 1 | `AppShell.module.css:287-302` |
| M13 | Mini App integration | None of: BackButton, MainButton, `disableVerticalSwipes`, `enableClosingConfirmation`, `setHeaderColor/BackgroundColor/BottomBarColor`, `viewportChanged`. A swipe down in the editor or a long list can close the app and lose text; in-page back links duplicate the native back affordance. The wrapper exposes only ready/expand. | 3 | `shared/telegram/web-app.ts:1-10,36-41` |
| M14 | Dark theme | No dark-specific layout defects at 375/390; same overflow (M1) in dark. | 0 | `*-dark.png` |
| M15 | 390 vs 375 | Identical findings. | 0 | `*-390-*.png` |

## 3. Research

Fetched this session: Telegram Mini Apps docs, https://core.telegram.org/bots/webapps (Design Guidelines, WebApp fields, changelog). Other sources are well-known platform guidelines cited from knowledge, not re-fetched.
- Telegram: "All elements should be responsive and designed with a mobile-first approach"; respect `safeAreaInset` and `contentSafeAreaInset` (Bot API 8.0) so content does not sit under Telegram controls; `BackButton` is shown "in the header of the Mini App in the Telegram interface" (hidden by default, Bot API 6.1+); `MainButton`/`SecondaryButton` are native bottom buttons (7.10 adds `bottomBarColor`); `viewportStableHeight`/`--tg-viewport-stable-height` is the right base for bottom-pinned UI (the live `viewportHeight` jumps during gestures); `isVerticalSwipesEnabled` / `disableVerticalSwipes()` (7.7) stops the swipe-to-close; `enableClosingConfirmation()` (6.2) for dirty forms; use `themeParams` and `colorScheme`.
- Material 3 navigation bar: 3-5 destinations on phones, always visible labels, rest in a drawer/"more": https://m3.material.io/components/navigation-bar/guidelines. Apple HIG tab bars: 5 max on iPhone, last tab «More»: https://developer.apple.com/design/human-interface-guidelines/tab-bars. Our 4 + «Ещё» matches both.
- Bottom sheets for secondary tasks, full screen for forms with a keyboard: Material 3 bottom sheets https://m3.material.io/components/bottom-sheets/overview; NN/g on mobile forms and sticky bars (https://www.nngroup.com/articles/mobile-navigation-patterns/).
- Scheduler/admin apps (Buffer, Later, Telegram's own @BotFather-style Mini Apps, Shopify mobile admin) share one pattern: bottom tabs, a list of cards with a status chip and one time line, tap opens a detail screen (not a drawer), one primary action pinned at the bottom of the detail. Pattern knowledge, no fresh capture; treat as a hypothesis.

## 4. Mobile layout system (proposal)

- Breakpoints: keep one: phone/tablet below 860px (already `max-width: 859px` everywhere), desktop above. Do not add more; design at 375 and test 320 (no horizontal scroll, WCAG 1.4.10).
- Navigation: keep the bottom tab bar (Главная, Посты, Публикации, Календарь, Ещё). Reason: thumb reach, matches Telegram and platform guidelines, already built, parity with desktop items via «Ещё». Hamburger menu rejected: hides destinations.
- Page header on phone: inside Telegram drop the app top bar (Telegram already shows the title bar and close/back); keep search and owner menu as icons inside the page header row. In a browser keep the slim top bar. Page title `h1` one line, ellipsis, details via `title`; actions as icon buttons or one primary button.
- Lists: always cards below 860px, fixed anatomy: title (2 lines max), status chip, one meta line (time, channel). Details as a bottom sheet (<=85dvh) for quick look, a route for anything with edit. Cards and grid tracks use `minmax(0, 1fr)`; no `nowrap` text in a card.
- Dialogs: confirm = centered small dialog; forms = full-screen sheet with a sticky footer (already so); publication/channel details = bottom sheet with grabber, header and footer padded, safe-area aware.
- Editor on phone: full-screen mode: hide tab bar and top bar on `/posts/new` and `/posts/:id`; title = auto-growing textarea; one pinned action row (Save/Approve) only; in Telegram use MainButton for the primary action («Одобрить»/«Сохранить») and BackButton for leaving; Preview as a tab (already). Keyboard open: pinned bar sticks to the visual viewport bottom.
- Telegram: BackButton follows router history (show when not on a tab root, hide on roots; remove the duplicate «Все посты» link in Mini App); MainButton for the single primary action of a screen where a sheet/page has one (editor, add channel); `disableVerticalSwipes()` on editor and forms (or everywhere: the app scrolls); `enableClosingConfirmation()` while dirty; `setHeaderColor`/`setBackgroundColor`/`setBottomBarColor` to our `--color-bg`/surface; subscribe `safeAreaChanged`, `contentSafeAreaChanged`, `viewportChanged`; guard each with `isVersionAtLeast`. Fallback in browser: the in-page controls remain, so parity holds.
- Safe areas: already `max(env(), var(--tg-content-safe-area-inset-*))`; also apply to sticky action bars and sheet footers (editor bar and drawer only partly do).
- Targets: >=44px for every control on phone, including text links («Все посты»), icon buttons.

New tokens/primitives (design-system): `--size-appbar`, `--size-actionbar` and a `--bottom-chrome-height` token (tab bar + action bar + safe area) driving scroll padding; `PageHeader` phone variant with back slot; `BottomSheet` primitive (rename/extend `Drawer variant=bottom` with grabber, padding, drag-less close); `SegmentedControl` overflow behaviour (wrap to stacked or icon+label); `StickyActionBar` primitive (stacks above the tab bar or replaces it); `useTelegramChrome` is frontend (wrapper), not design-system.
Per-screen (frontend): everything in the backlog below that is a single page fix.

## 5. Backlog (one task each)

P0 unusable
1. [frontend] Fix M1: `minmax(0,1fr)` tracks in `DataTable` cards, drop `nowrap`/`max-width:36ch` in cards, filter selects `width:100%`; add a Playwright/axe check `scrollWidth === clientWidth` at 320/375/390 for every route. Re-verify drawer (M2).
2. [frontend] Fix M4: theme control readable without hidden scroll (stack on phone or shorter labels).

P1 painful
3. [design-system] `BottomSheet` primitive: padded header/body/footer, safe-area footer, max height, used by publication and channel drawers (M2).
4. [design-system+frontend] Editor full-screen mode on phone: no tab bar, no top bar; single action row; `visualViewport`-aware (M6).
5. [frontend] Telegram wrapper: `BackButton` bound to router history, hidden on tab roots; remove duplicate back links in Mini App (M13).
6. [frontend] Telegram wrapper: `disableVerticalSwipes`, `enableClosingConfirmation` while dirty, header/background/bottom bar colors, `safeAreaChanged`/`viewportChanged` (M13). API need: none.
7. [frontend] `MainButton` for editor primary action and add-channel (needs item 5; browser keeps in-page button).
8. [frontend] Pipeline labels: no mid-word break (M3), shorter labels or two-line steps.
9. [frontend] Hide the app top bar inside Telegram; keep search/owner menu in page header (M8).

P2 polish
10. [frontend] Back link and other text links >=44px target (M7); title in editor as growing textarea.
11. [frontend] Appearance: accent options as a 2-column swatch grid; save bar sticky above tab bar (M5).
12. [frontend] Tab bar label size/spacing at 320-375 (M12); owner menu icon contrast.
13. [frontend] Dashboard phone composition once data exists (M11).
14. [frontend] Visual baselines at 375/390 light+dark for all routes in CI container (skill `visual-check`).

Given/When/Then (acceptance for items 1-2): Given any route at 320, 375 or 390px, When it loads with long titles and channel names, Then the page has no horizontal scroll, no text clipped by the viewport, and every control is reachable without sideways scroll.
