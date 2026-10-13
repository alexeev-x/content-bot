# Platform expansion — owner choice before integration

Queue item: 24 (`docs/IMPLEMENTATION_PLAN.md`), Phase 8. This is a read-only feasibility handoff; no account is connected, no credential is requested or stored, and no platform write is authorized.

## Plan

The target is a single Studio content record with manually authored platform variants, platform-specific destinations/publications, capability preflight, processing/result states and analytics snapshots. Per the plan, platforms are added one at a time. Telegram remains the proven first destination.

## Official API constraints checked (2026-10-13)

### TikTok

- Direct Post requires a registered developer app, Content Posting API product, approved `video.publish` scope and the creator’s authorization. The integration must query creator information and honor the returned privacy choices.
- Unaudited clients are limited to private-only posting; lifting this restriction requires TikTok’s audit. TikTok documents a 5-user/day cap for unaudited clients and per-creator posting caps.
- Pulling media from a URL requires verification of the domain or URL prefix. This adds a domain-ownership requirement to the current private-media architecture.
- Official references: [Direct Post getting started](https://developers.tiktok.com/docs/en/content-posting-api-get-started), [Content Sharing Guidelines](https://developers.tiktok.com/docs/en/content-sharing-guidelines), [Direct Post API](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post).

### YouTube

- Upload uses OAuth authorization (including the `youtube.upload` scope) and a Google API project. The Data API documents a default 100 `videos.insert` calls/day plus 10,000 units/day for other methods; quota extensions require an audit.
- Videos inserted by unverified API projects are restricted to private viewing until the project passes the required audit. Upload privacy must be explicit; the project must not silently change it.
- Official references: [videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert), [quota and compliance audits](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits), [Developer Policies](https://developers.google.com/youtube/terms/developer-policies).

## Decision required

Choose one before integration planning proceeds:

1. **YouTube first** — authorize read-only setup of the owner’s Google API project and OAuth/privacy-policy requirements; upload implementation remains a separate approval.
2. **TikTok first** — authorize read-only app/access setup and determine whether private-only unaudited testing is acceptable; public posting still requires TikTok audit and explicit publish approval.
3. **Defer platform expansion** — keep Telegram only until the owner is ready to select a platform and complete its external onboarding.

Recommendation: choose option 3 for now. Both platforms add a new OAuth credential boundary, compliance work and public-publication risk; TikTok additionally starts private-only until audit, while YouTube has project audit restrictions and quota policy. If expansion is a near-term priority, pick the platform matching the owner’s actual channel and authorize only a read-only feasibility/setup step first.

Until a choice is recorded, queue item 24 is `waiting for owner`. No platform connector, credential, migration or publishing code is started.
