# Settings rework: theme in one click, master/detail sections

Status: audit + spec for review (UX). Expert review, not validated with users. Owner words: «саму страницу настроек надо переработать, ибо чтобы цвет поменять надо туда зайти». Related: § Density revision in `docs/DESIGN_SYSTEM_NO_FIGMA.md` (Settings = two-column master/detail without large cards); the bot status leaves Settings for a dashboard widget (separate task), so «Бот» is removed here. Code was read, not run; no screenshots.

## 1. Cognitive walkthrough (today)

| Task | Steps today | Failing question | Evidence | Sev |
|---|---|---|---|---|
| Switch to dark | 1 open owner menu «⋯»/name; 2 «Оформление» (navigates away from the current work); 3 find the «Режим темы» card; 4 pick «Тёмная»; 5 scroll to the footer, «Сохранить»; 6 go back. 5-6 actions, a page change, work context lost | "Link control to goal": a theme is a preference, the menu entry reads as a destination. Preview is instant, but nothing persists until Save | `OwnerMenu.tsx:16,24`; `AppearanceEditor.tsx:110-122,167-176` | 3 |
| Change accent | Same 1-2, then accent is per theme: two cards (light, dark), the visible theme's card is not marked; change, Save. Changing "the color I see" needs knowing which of two cards applies | "See progress": the other theme's card changes nothing visible | `AppearanceEditor.tsx:124-140` | 3 |
| Leave with an unsaved edit | Blocker dialog «Уйти без сохранения?» for a theme toggle: confirm for a reversible, cheap action | Principle: undo beats confirm | `AppearanceEditor.tsx:69-72,186-198` | 2 |
| Add a channel | Desktop: sidebar «Настройки» → lands on «Каналы» (redirect) → «Добавить» = 2 clicks. Phone: «Ещё» → «Настройки» → «Добавить» = 3 taps; «Настройки» hides in the sheet (`primary: false`) | OK on desktop; acceptable on phone for a rare task | `nav-items.ts:20`; `settings.index.tsx:5`; `ChannelsPage.tsx:23-30` | 1 |
| Find a section | Pill tabs «Каналы · Бот · Оформление» scroll horizontally; «Бот» to be removed. Tabs cannot grow past ~5 sections | Heuristic 6 (recognition), scaling | `SettingsLayout.tsx:9-20` | 2 |

Root cause: a frequent, instant preference is placed in the same deep, save-gated editor as rare, multi-field work (custom colors).

## 2. Research (comparable tools)

- Linear: theme (system/light/dark + presets) lives in Settings > Preferences, reachable by the keyboard sequence G then S ([account preferences](https://linear.app/docs/account-preferences)). Not one click, but a shortcut makes up for it.
- GitHub: the command palette has a «Switch theme» command, so theme changes without leaving the page ([command palette](https://docs.github.com/en/get-started/accessibility/github-command-palette)). Same idea in VS Code and Raycast ("Switch Theme", [Raycast themes](https://manual.raycast.com/themes)).
- Settings structure: master/detail is the standard drill-in for hierarchical pages with quick sibling switching; Microsoft notes some simple settings need no master view ([master-detail](https://developer.microsoft.com/en-ca/azure-devops/components/master-detail)). Slack and Notion put settings in a left section list with the detail on the right (not verified in the sources fetched).
- Convention adopted: a quick, applied-instantly control in the account area for the frequent choice; the full editor in Settings; the command palette as an optional second route.

## 3. Proposal

### 3.1 Quick theme toggle (owner decision 07.10.2026)
- A top-bar button next to the owner menu, on desktop and phone. Its accessible name says what a press does: «Включить тёмную тему» or «Включить светлую тему». Its icon shows the target theme (moon or sun). One press switches between light and dark. There is no popover and no accent choice here.
- From «Системная», a press sets the theme opposite to the one on screen. «Системная» is chosen again only in Settings → Оформление.
- The press applies at once and saves immediately with `PUT /appearance` (the cached `revision`, only `themeMode` changed). There is no Save button and no confirmation: a theme switch is cheap and undone by the same button. An `aria-live` polite region announces «Тёмная тема» or «Светлая тема».
- 409 (another device changed it): refetch, re-apply `themeMode` on the newest revision, retry once, silently. Any other failure: revert to the server value and show a toast «Не удалось сохранить тему. Вернули прежнюю.» with «Повторить». Presses are serialized; the last one wins.
- **Accent and style changes are confirmed** (owner decision): they stay in Settings → Оформление with explicit «Сохранить» / «Отменить» and the leave confirmation. The quick control never changes the accent.
- The owner menu «⋯» keeps only «Выйти»; its «Оформление» entry becomes the «Оформление» section in Settings.
- Later, when the command palette exists: «Тема: светлая / тёмная / системная».

### 3.2 Settings information architecture
- Sections now: **Каналы**, **Оформление**. Nothing else gets a slot until built (no empty sections). Candidates for later, each added with its screen: Интеграции (`/settings/integrations`), Часовой пояс и умолчания автоматизаций. «Бот» is removed with its route `/settings/bot`.
- Desktop (>= 860px): two columns, list 200px on the left (link rows, thin accent mark + light background for the active one, like the sidebar), detail fluid on the right; no pill tabs, no outer cards (the section title is a heading, rows with thin dividers). `/settings` redirects to `/settings/channels` here.
- Phone: `/settings` shows the section list (rows >= 44px with chevron, no redirect); a row opens the detail with a «‹ Настройки» back control in the header (and the Telegram BackButton in the Mini App, per `docs/stories/mobile-layout.md`). Phone-vs-desktop is decided by the media query, one route set.
- Full Appearance detail: mode, accent per theme (the card of the resolved theme is marked «Сейчас»), custom colors (add/edit/delete, up to 10, `CustomPresetDialog`), preview, Save/Discard with draft and leave-confirm as today. Batch editing of custom colors keeps explicit Save because a half-edited palette is worth guarding.
- Channels detail: list + «Добавить» + drawer unchanged (query param `channel`).

### 3.3 States, copy, focus, a11y
- Loading: the toggle is disabled until `GET /appearance` resolves; it may show the cached local value meanwhile. Load error: the toggle stays disabled and has the tooltip «Не удалось загрузить оформление». Offline follows the failure path.
- Copy (RU): «Включить тёмную тему» / «Включить светлую тему» (button names), «Тёмная тема» / «Светлая тема» (live announcement), «Не удалось сохранить тему. Вернули прежнюю.», «Повторить», «Настройки» (back), section names «Каналы» and «Оформление».
- Focus stays on the toggle after a press and after a failure. In Settings the arrow keys do not move through the list (plain links, Tab). On phone, back returns focus to the row that was opened.
- Targets: 44px on touch and in the Mini App, 34–36px for a fine pointer on desktop.
- Mini App parity: the same top-bar button. `system` follows Telegram's color scheme (existing `getTelegramColorScheme`). Settings are stored on the server, so the browser and the Mini App agree.

## 4. Acceptance criteria
- Given any screen in the light theme, when I press the theme button, then the theme turns dark at once, it is saved (a reload keeps it), I stay on the same page and nothing asks for confirmation.
- Given the mode is «Системная» and the screen is dark, when I press the button, then the mode becomes «Светлая».
- Given the save request fails, then the screen returns to the previous theme, the toast «Не удалось сохранить тему. Вернули прежнюю.» shows «Повторить», and no stale value is stored.
- Given another device changed the appearance, when I press the button (409), then my theme is applied on the newest revision once, with no error.
- Given Settings → Оформление, when I pick a new accent, then nothing is saved until I press «Сохранить»; leaving with an unsaved accent asks for confirmation.
- Given unsaved accent edits in Settings → Оформление, when I press the theme button, then no leave confirmation appears, and the editor shows its conflict banner on its next save.
- Given a phone at 375px, when I open `/settings`, then I see the list (Каналы, Оформление); a tap opens the detail, and «‹ Настройки» returns to the list with focus on that row.
- Given a desktop at 860px or wider, when I open `/settings`, then the list and the channels detail are side by side, without large cards.
- Given the owner menu, then it has only «Выйти», and `/settings/bot` no longer exists.
- Given keyboard only, then Tab reaches the theme button, Enter or Space toggles it, and focus stays on it.

## 5. API needs
None: `GET/PUT /appearance` with `revision` and 409 `STALE_REVISION` cover it. Not needed: a partial-update endpoint (client merges the single field and retries once on 409).

## 6. Owner decisions (07.10.2026)
1. A separate top-bar button that simply toggles light ↔ dark: accepted.
2. The theme toggle saves at once; accent or style changes need an explicit Save in Settings → Оформление: accepted.
3. Theme commands in the command palette: later.
4. Settings as master/detail with two sections (Каналы, Оформление): accepted as the default (the owner did not object).
