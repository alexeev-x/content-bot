# 1. Shell

**Purpose / primary task:** move between work areas and see what needs attention without losing place.

### 1.1 Desktop composition (>= 860 px; adapt fluidly for laptop and large desktop)
- Sidebar 216-224 px expanded / 56-64 px collapsed rail. Collapse control **bottom-anchored** (owner likes it), 200 ms width transition, `prefers-reduced-motion` = instant; state persisted; current route never lost. Order: Обзор, Посты, Публикации, Инциденты (badge = open incidents count, the only badge), Настройки pinned bottom. Active = 2 px accent edge + subtle bg. Collapsed rail: icons with tooltips + `aria-label`.
- Top bar (thin, 48 px): left = logo (phones), right = read-only timezone chip («Europe/Chisinau (UTC+3)»), environment chip (DEV, always visible on dev), system-status chip (see 2.7), theme toggle, owner menu (`Выйти` only). Not a second dashboard.
- Sidebar bottom: only «Свернуть меню»; no channel card (owner, 14.10.2026: the channel lives in Настройки → Каналы).
- Search: **no global search** (docs/DECISIONS.md, 14.10.2026); lists search inside their own panel (Посты, Публикации).
- Sticky: sidebar and top bar. Page content scrolls; page header does not stick on desktop.

### 1.2 Compact composition (< 860 px; phone and narrow/tablet portrait widths)
- Bottom tab bar, 4 tabs + «Ещё»: **Обзор, Посты, Публикации, Инциденты (badge dot/number), Ещё**. «Ещё» sheet: sections only, no channel card (owner, 14.10.2026: the channel lives in Настройки → Каналы), Настройки, theme, Выйти, (Later: Календарь, Медиа, Автоматизации when built). Reason: Календарь is a stub; Инциденты is a daily "resolve" task and an `unknown` is time-sensitive (wasted tap otherwise). 48 px high, labels always visible, 11.5-12 px min, no wrap at 320.
- Top app bar (browser only): logo, DEV, theme, owner menu. **Inside Telegram: hidden**; the owner menu and theme move into the page header's overflow (Ещё sheet holds theme).
- Detail/edit routes (`/posts/new`, `/posts/:id`, Settings detail) hide the tab bar (full-screen) and show a back chevron (44 px) in the header; Mini App uses BackButton instead.
- Safe areas: `max(env(), --tg-content-safe-area-inset-*)` on tab bar, action bar, sheet footers. Pinned UI follows `visualViewport` when the keyboard opens.

### 1.3 Shell states
Session restore: shell + route skeleton at once (done). Offline: persistent slim banner under the top bar «Нет соединения. Данные могут быть устаревшими.»; mutations disabled with reason (never queued). Unauthorised: redirect to `/login`. Route error: `RouteError` inside the content area, shell stays.
