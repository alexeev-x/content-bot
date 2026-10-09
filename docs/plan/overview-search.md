# Overview and search

Part of the master plan; status, order and the queue live in `docs/IMPLEMENTATION_PLAN.md`. Section numbers are the plan's own, so `§N` references stay valid.

## 3.4 Decision Center / Overview

Purpose: tell the owner what requires attention now.

The home page is not a KPI wall and not four empty cards.

Target sections:

- Требует внимания.
- Сегодня.
- Одобрены, но не запланированы.
- Последние черновики.
- Ближайшие публикации.
- Недавно отправлено.
- active incidents.
- source or automation problems once those systems exist.
- fresh Dota events once Dota Intelligence exists.
- compact system status.

When there is no work, the empty state must contain useful next actions such as Новый пост, Открыть календарь or Посмотреть последние Dota-события.

## 8. Decision Center / Overview v2

The existing page is too empty when the system is healthy.

Target layout:

### Требует внимания

Contains only actionable items:

- FAILED/UNKNOWN publications.
- stuck job.
- bot/channel permission issue.
- stale source.
- failed automation.
- migration/configuration issue.

### Сегодня

- publications today.
- drafts touched today.
- approved but not scheduled.
- nearest scheduled item.
- timezone.

### Продолжить работу

- latest three drafts.
- direct Continue action.
- New Post primary action.

### Недавно отправлено

- latest successful publications.
- compact status and timestamp.
- open publication.

### Dota Pulse

Appears only after Dota Intelligence exists:

- latest official Dota events.
- new patch/update.
- new treasure/cosmetic event.
- watchlist changes.

No AI suggestion is shown.

### System status

Compact when healthy. Expanded only when something needs attention.

## 16. Global search / command entry

The disabled header search is temporary and must not remain dead UI; the Ctrl/⌘ K palette needs an entity-search endpoint.

First functional scope:

- posts.
- publications.
- incidents.
- Dota events once available.

Later:

- media.
- sources.
- automations.
- channels.

Search is navigation-first. It is not a universal destructive command executor.

Potential quick actions:

- Новый пост.
- Открыть календарь.
- Показать FAILED.
- Показать сегодня.
