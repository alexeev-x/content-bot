# Media library and pipeline

Part of the master plan; status, order and the queue live in `docs/IMPLEMENTATION_PLAN.md`. Section numbers are the plan's own, so `§N` references stay valid.

## 17. Media library

After manual post uploads are stable, build /media.

Capabilities:

- all uploaded assets.
- type.
- dimensions/duration.
- size.
- created time.
- usage count.
- linked posts/revisions/publications.
- search.
- filter.
- preview.
- safe delete only when unused or through explicit lifecycle rules.
- duplicate detection by checksum.

Do not add automatic internet downloading or generated media in this phase.

## 18. Later automated media pipeline — separate large project

This is deliberately deferred.

Possible future non-AI capabilities:

- download an allowed official image from a configured source.
- import official treasure/set images.
- resize/crop.
- transcode.
- create deterministic template cards.
- prepare Telegram/TikTok/YouTube variants.
- render branded cards from structured Dota data.

This project requires its own architecture, storage budgets, copyright/source rules, rendering pipeline and operational limits.

Generative image AI is not part of this plan.
