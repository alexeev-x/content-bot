# Dota watchlists — what is not built

Intent: on `/sources` the owner sees and manages exact hero/item watches and their matches. Behaviour, copy, states and focus rules: `docs/design/ux/sources.md` (§3.9). API: `apps/contracts/src/dota-watchlists.ts`.

Built: backend (`GET/POST/DELETE /api/v1/dota/watchlists`, matching and private alerts in Cron) and «Следить за героем/предметом: {name}» with «Уже отслеживается» in the update detail.

Not built (frontend only; `useRemoveDotaWatchlist` exists but nothing uses it):

- «Мои отслеживания» panel in «Обновления» (after filters, before the update list): named watch rows, kind, latest matching update or «Совпадений пока нет», empty state «Вы пока ничего не отслеживаете».
- Remove from the row's «⋯» menu «Не отслеживать: {name}»: no confirmation, no optimistic success; focus moves to the next row or the panel heading.
- Matches in the update feed: «Совпадение» plus the matched entity on the real update row, and the alert outcome from `alertStatus`. `unknown` shows «Требует проверки» with the duplicate-risk text and never offers a resend.
