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

## Owner decision (13.10.2026)

Choose YouTube first. The owner-only OAuth path is authorized as the first platform integration, but external setup remains a prerequisite: a dedicated Google API project, OAuth client/redirect configuration, a privacy-policy URL and the owner's consent grant. No login credentials may be collected; store tokens only in approved server-side secret/secure storage. Upload remains a separate explicit user-triggered action per video; there is no silent scheduled upload. Queue item 24 is waiting for external onboarding. This decision does not mean an account is connected or the integration is live.
