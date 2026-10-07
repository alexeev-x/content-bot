# TikTok, YouTube and audience

Part of the master plan; status, order and the queue live in `docs/IMPLEMENTATION_PLAN.md`. Section numbers are the plan's own, so `§N` references stay valid.

## 19. TikTok and YouTube — later platform expansion

Telegram remains the proven first destination. Multi-platform work begins only after Content Studio, media, scheduling and operational history are stable.

### 19.1 Platform model

Do not bolt platform fields onto Post one by one.

Introduce:

- platform destinations/accounts.
- platform-specific publication records.
- platform capability/preflight data.
- platform-specific result ids.
- processing status.
- platform metrics snapshots.

### 19.2 TikTok target capabilities

Subject to official API access and account eligibility:

- upload.
- direct publish or draft flow as supported.
- privacy/options preflight.
- video duration/capability checks.
- photo/carousel support when supported.
- processing status.
- publication result.
- analytics ingestion where available.

### 19.3 YouTube target capabilities

Subject to official API access:

- resumable upload.
- Shorts/video.
- title/description.
- thumbnail.
- playlist.
- processing state.
- captions later if manually supplied.
- publication result.
- analytics ingestion.
- comments read/manage where permitted.

### 19.4 Platform variants

A single content record may have manually authored variants:

- Telegram text.
- TikTok caption.
- YouTube title.
- YouTube description.

No AI generation is used. The owner edits variants directly.

## 20. Comments and audience data — later, non-AI

Where platform APIs permit:

- comments list.
- search.
- sort.
- unanswered filter.
- manual tags.
- manual reply.
- moderation actions where allowed.
- link a comment to a manually created content note/idea.

No automated sentiment, clustering or AI reply generation in the active plan.
