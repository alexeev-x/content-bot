---
name: ui-patterns
description: "Interaction patterns for the admin UI: modal dialog, destructive confirmation, toasts/live status, form validation with error summary, data tables, empty/loading/error states, status badges, date-time with timezone, tabs and menus. Use when building or reviewing UI."
---
# UI patterns

Foundation: use a native element first and ARIA only when nothing native fits (no ARIA beats bad ARIA). A `<button>` acts; a link navigates. Never put `onClick` on a `div`.

## Modal dialog
- Use the `shared/ui` Dialog (React Aria `Modal` + `Dialog`): it handles the inert background, Esc and focus. Give it a heading (`slot="title"`); destructive confirmations use `role="alertdialog"`.
- Initial focus goes to the least destructive control, or to the title when the content is long. Focus returns to the trigger on close. Never nest dialogs.

## Destructive or irreversible action
- The dialog names the object and the consequence: «Отменить публикацию "Герой дня" на 14:30?». Buttons say the verb («Отменить публикацию» / «Не отменять»), never «OK» or «Да».
- Never focus the destructive button by default. For `unknown`, add an explicit duplicate-post warning.
- Show the result only after the server confirms it. No optimistic success.

## Toast and live status
- Use the `shared/ui` Toast (our wrapper over React Aria `UNSTABLE_Toast`, isolated so its API can change in one place). Results use `role="status"` (polite). Use `role="alert"` only for blocking failures. Render the live region before inserting text into it.
- Error toasts don't auto-dismiss and can be dismissed. A toast is never the only way to recover: persistent state belongs on the page.

## Forms
- Every field has a visible `<label>`, optional hint, and `aria-describedby` → hint + error. Set `aria-invalid` when invalid. A placeholder is never a label.
- Validate on submit, then re-validate on blur/change after the first error. Never clear what the user typed.
- On a failed submit, show an error summary at the top (focus it or give it `role="alert"`). Each item links to its field, and the texts match the inline messages.
- A message says what is wrong and how to fix it, in plain Russian: «Введите время публикации в будущем», not «Invalid date».

## Data tables
- Use the `shared/ui` Table (React Aria `Table`, sortable columns built in) or a real `<table>` with `<caption>`, `<th scope>`. No hand-made ARIA grid.
- A sortable column has a `<button>` inside its `<th>`. Only the sorted column carries `aria-sort`.
- Page and filters live in the URL (back button works, links are shareable). Use pages, not infinite scroll, for operator lists.
- At 375 px, switch to cards, or scroll inside a labeled `role="region" tabindex="0"` wrapper. Never hide columns silently.

## Loading, empty and error
- Loading: a skeleton that matches the final layout, with `aria-busy` on the region and no layout jump.
- Empty: explain why and offer one primary action. Distinguish "no data yet" from "filters hide everything" (which offers «Сбросить фильтры»).
- Error: short text, the `requestId`, and retry only for safe reads. A 403 shows no data.

## Status badges
- Show text plus an icon or shape, never color alone (WCAG 1.4.1). Use the labels and token groups from the status mapping in skill `page-spec`.
- `unknown` looks clearly different from «Ошибка», because it needs a human decision rather than a fix.
- Announce only user-relevant changes, batched in one polite region.

## Date, time and timezone
- Store UTC. Display every time in the owner's zone (Settings) WITHOUT naming the zone or offset: «14:30». The zone is shown only in Settings (owner decision 14.10.2026).
- Input with the `shared/ui` DatePicker/TimeField (React Aria + `ZonedDateTime` from `@internationalized/date`, `I18nProvider locale="ru-RU"`). No UTC hint. Validate that the time is in the future, and warn about DST gaps and overlaps.
- Format with `Intl.DateTimeFormat` and an explicit `timeZone`. Never write a bare "local time".

## Tabs, menus, disclosure
Follow the APG keyboard models:
- Tabs: arrow keys move between tabs, Tab leaves, roving tabindex.
- Menu button: Enter/Space/↓ opens, Esc closes and returns focus.

Prefer `<select>` and `<details>` when they are enough.

## React specifics
- Derive state during render. `useOptimistic` is allowed only for reversible local UI (reordering), never for publish, cancel or retry.
- `useActionState` is fine for form pending/error when it fits React Hook Form.

Sources: `references/sources.md`.
