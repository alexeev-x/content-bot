# Analytics v2 — manual post-performance observations

Queue item: 22 (`docs/IMPLEMENTATION_PLAN.md`), Phase 6. Implementation follows the owner decision of 13.10.2026: manually entered observations only; no Telegram user session, MTProto credential, Bot API collection job or inferred metrics.

## Goal

As the Studio owner, I can record and compare explicitly sourced Telegram post-performance observations at a known content age, while missing or partial coverage remains distinct from zero.

## Facts

- Queue item 13 provides owner-only, read-only publication reliability snapshots with captured destination/media facts. It does not contain native channel performance metrics or a dependable send timestamp.
- The Bot API feasibility proof found no channel-post views or rich historical channel statistics. Rich native metrics requiring MTProto remain out of scope.
- The target design in `docs/plan/analytics.md` §11 calls for same-age comparisons, explicit source/freshness and supported/partial/unavailable states; comparisons must not imply causation.
- The operator enters values copied from an external analytics surface. Studio labels these as owner-entered; it does not verify, backfill, infer or refresh them.

## MVP scope and assumptions

- Extend the existing `/analytics` page; do not add navigation or a separate route.
- Record one metric for one already-sent publication per form submission. Supported metrics: post views, forwards and reactions. No channel subscriber count in this MVP because it has no meaningful per-post content age.
- The owner selects one of the standard content ages: +1h, +3h, +6h, +12h, +24h, +48h, +72h or +7d. The age is entered explicitly and is never derived from `scheduledAt` or a guessed send time.
- Each observation includes the metric, nonnegative integer value, selected content age, observation timestamp set by the server, coverage (`complete` or `partial`), and a required short source label (for example, the name of the external screen). A partial observation also requires a note. Missing data is not entered as zero; unavailable metrics are not stored as observations.
- Observation history is append-only. There is no edit, delete, import-file upload, export, automatic collection or retention job in this MVP. If a value was entered incorrectly, the owner records a new observation with a note that identifies the correction; reports preserve both records and clearly identify the latest observation for each publication/metric/age.
- The report compares absolute values only at the same metric and content age. It shows the owner-entered source, observation time, coverage and selected publication/destination. No percentages, rankings, minimum-sample rule or causal language.
- Owner-only access. Recording has no publishing, retry, reconciliation or Telegram side effect.

## Input flow

1. From `/analytics`, choose “Добавить наблюдение”.
2. Select an already-sent publication from a bounded, searchable list; do not accept a free-form publication ID.
3. Select metric and content age; enter value, source label, and coverage. If coverage is partial, require a short explanation.
4. Review a summary naming the publication, metric, age, value and source; confirm once.
5. On success, show the persisted observation and refresh the report. On failure, preserve all inputs and allow an explicit retry; the mutation is idempotent and never claims success before the server confirms it.

## Acceptance criteria

- Given an owner opens Analytics, when the report loads, then the existing reliability report remains available and the new manual-observation comparison is clearly separate from Studio-measured publication outcomes.
- Given a publication is not sent, when the owner searches the picker, then it is not selectable.
- Given a valid complete observation, when the owner confirms, then exactly one owner-entered record is stored and the report shows its metric, content age, source, observation time and coverage.
- Given partial coverage is selected, when the source note is empty, then submission is blocked with an inline error and focus moves to the error summary; when a note is supplied, the record is labeled partial.
- Given the value is zero, when it is saved, then it is displayed as an explicitly entered zero, not as missing data.
- Given a metric/age has no observation, when the report renders, then it says “Нет наблюдений”, not `0`.
- Given two observations use different content ages, when the owner compares them, then they are not shown as a same-age comparison.
- Given an observation is corrected, when a new record is entered, then older history remains visible and the latest record is identified without silently overwriting the prior value.
- Given the same idempotency key and payload are retried, when the original request has completed, then the original response is returned without a duplicate observation; same key with a different payload returns 409.
- Given a non-owner, expired session or failed GET/POST, then private data is not exposed, filters/form values are preserved where safe, and errors show the request ID with safe retry only for the read or idempotent mutation.
- Given a phone viewport from 320px, when the owner records or inspects observations, then there is no horizontal page overflow, controls remain keyboard-accessible, and primary touch targets are at least 44×44px.

## UX handoff

### Entry points and screen map

- Keep `/analytics` as the only route. Preserve the existing Studio-measured reliability report as its own section.
- Add a visually separate section titled **«Ручные наблюдения»**, with a persistent note: **«Значения введены вручную по внешнему источнику. Studio не получает статистику из Telegram и не проверяет её.»**
- The section header has the single primary action **«Добавить наблюдение»**. Below it, show report controls for metric and content age, then an observation list. Do not reuse period/destination/media/outcome filters from the Studio reliability report.
- Report rows show publication title + destination, explicit value + metric, content age, source label, coverage, observation time in owner timezone, and a **«Последнее для этого периода»** marker when it is the newest record for that publication/metric/age. Previous corrections remain reachable in the history list.
- Use text and icons as well as semantic colour for coverage. Complete = **«Полные данные»**; partial = **«Частичные данные»** plus its note. A missing combination reads **«Нет наблюдений»**, never zero. Zero is rendered as `0` with the selected metric.

### Add-observation flow

1. **Open** the form from «Добавить наблюдение». Desktop: centered dialog with a single-column form; phone: the same dialog constrained to the viewport, body scrollable, actions visible after the form. The intro reminds the owner that the content age must be selected from the external measurement, not inferred by Studio.
2. **Choose a sent publication** using a bounded search field and result list. Each result names the post and destination. Unsent, deleted or unmatched publications are not selectable. Empty picker copy: **«Нет отправленных публикаций для выбора»**.
3. **Enter the observation**: metric selector (Просмотры / Пересылки / Реакции), age selector (+1 ч / +3 ч / +6 ч / +12 ч / +24 ч / +48 ч / +72 ч / +7 дн.), numeric value (zero allowed), source label, and coverage choice. On partial coverage reveal required note. Show correction guidance: **«Исправляете прежнее значение? Добавьте новую запись и укажите это в примечании; прежняя запись сохранится.»**
4. **Review before saving** in a compact summary: publication + destination, metric, age, value, source and coverage. The primary button names the action: **«Сохранить наблюдение»**. Secondary **«Назад к форме»** returns with all fields intact. No optimistic success.
5. **Success** closes the dialog, focuses the newly added row, announces **«Наблюдение сохранено»**, and refreshes the selected report. The row displays server observation time and owner-entered provenance.

### Exit, errors and recovery

- Cancel button, Escape or backdrop closes without saving and returns focus to the same **«Добавить наблюдение»** button. No discard confirmation: unsaved form state is local and can be re-entered; reopening starts blank.
- Client validation runs on submit. Keep every value on failure; show an error summary at the top of the dialog, inline messages by fields, and move focus to the summary. In particular, missing partial note reads **«Добавьте примечание к частичным данным»**.
- For 401 show the sign-in recovery; for 403 state that this page is owner-only. For storage/validation/conflict errors show request ID where available, preserve fields and let the owner explicitly retry. Retry uses the same idempotency key only for the unchanged payload. A changed payload gets a new key.
- During save, keep the dialog open, prevent duplicate submission and do not say saved until the server confirms. If result is uncertain, explain that retrying the same submission is safe and replayable; do not clear the values.
- Report loading uses stable row skeletons; read errors offer **«Повторить»** and preserve report filters. Partial report coverage is disclosed in text. An empty report says **«Пока нет ручных наблюдений»** and offers the primary action. A filtered empty state says **«Нет наблюдений для выбранных показателей и возраста публикации»** and keeps the filters visible.
- Pagination keeps the selected metric/age and returns focus to the list heading after a page change. A correction never overwrites the old row; newest is identified by server observation time.

### Responsive and accessibility contract

- At 320–759 px, stack all controls and report fields; observation rows become cards, not a wide table. No horizontal scrolling of the page. Dialog fields are full width, and primary/cancel targets are at least 44×44 px.
- At 760–859 px use a single content column. At 860 px and wider keep the existing Analytics page composition and add the manual report as a full-width section beneath Studio reliability; do not squeeze its independent filters into a side rail.
- All controls have visible labels. Metric/age/coverage are grouped with a legend; errors are textual and programmatically associated. On success announce via live region. Respect reduced motion and existing light/dark tokens.
- Expert review only; not validated with owner usability testing. No owner reference images were supplied.

### Design evidence

- Form errors use both a summary and inline messages, preserve entered answers and focus the summary, following the [GOV.UK validation pattern](https://design-system.service.gov.uk/patterns/validation/) and [error summary guidance](https://design-system.service.gov.uk/components/error-summary/).
- This UI records owner-supplied values only. Telegram's [channel FAQ](https://telegram.org/faq_channels) describes a post view counter but does not establish a Studio collection API; feasibility and scope remain as documented above.

### Implementation status and API

- A bounded owner-authenticated list of sent publications for the picker, with stable ID, title, destination and publication timestamp as known; never infer send time from scheduling.
- An idempotent create operation for one observation, including explicit supported metric, value, content age, source label, coverage and optional partial-coverage note. Server supplies observation time and actor provenance.
- A bounded, filterable read for observations grouped only by metric and content age, with pagination and enough provenance to identify latest/corrected entries.
- Stable errors for invalid metric/value/age, unavailable publication, stale/expired idempotency claim, unauthorized/forbidden and unavailable storage. The server validates every field with shared Zod contracts.

**Current implementation:** shared contracts and owner-only backend routes for the eligible-publication picker, observation list and idempotent create are implemented locally. Analytics v2 frontend, prototype QA and integrated R3 review are not complete; the migration is not applied to remote DEV D1.

## Deferred

MTProto or user-session integration; automatic Bot API collection; channel subscriber observations; bulk CSV/file import; editing/deleting observations; retention/compaction; age inference; cross-age ranking, percentages or causal conclusions; metrics beyond views/forwards/reactions.
