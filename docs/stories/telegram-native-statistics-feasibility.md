# Telegram native statistics feasibility

Queue item: 14 (`docs/IMPLEMENTATION_PLAN.md`). Sources were checked against Telegram's official documentation on 2026-10-12. This is a feasibility proof only; it adds no connector, user session, collection job, or analytics UI.

## Finding

The current Bot API publishing integration cannot supply Telegram's rich channel/post performance report. Bot API can return a current chat member count and, with administrator rights plus explicitly subscribed updates, can report future membership/reaction changes. Those update streams do not provide historical backfill. The official Bot API reference reviewed here contains no channel-post view statistic or native channel analytics method; this negative finding is an inference from the documented API surface.

Telegram documents richer channel and per-message statistics through MTProto's `stats.getBroadcastStats` and `stats.getMessageStats`. These are user-authenticated methods, require channel admin status and server-side eligibility (`can_view_stats`), and route to the channel's statistics data center. The channel response includes follower/growth, views/shares/reactions per post, enabled notifications, view/follower source graphs, language graphs and recent post interactions.

MTProto would introduce a personal Telegram account session and application credentials. Telegram requires an `api_id`/`api_hash` for user authorization and warns that accounts using unofficial client apps are automatically put under observation. Persisting that user session in the existing Worker would expand the security and runtime model. Do not attach it to the current bot token flow.

## Evidence

| Capability | Official evidence | Project implication |
|---|---|---|
| Current audience count | Bot API `getChatMemberCount`: “get the number of members in a chat.” [Bot API](https://core.telegram.org/bots/api) | A point-in-time count is possible, but not historical growth unless the project starts recording it. |
| Future join/leave and reaction events | Bot API `chat_member` requires the bot to be an administrator and explicitly included in `allowed_updates`; reaction count updates have the same admin/subscription requirement. [Bot API updates](https://core.telegram.org/bots/api#update) | Could support future-only event-based counts after an explicit implementation decision; cannot reconstruct earlier history. |
| Channel and message performance | MTProto `stats.getBroadcastStats` returns `followers`, `views_per_post`, `shares_per_post`, `reactions_per_post`, `enabled_notifications`, source/language graphs, and recent-post interactions; `stats.getMessageStats` returns per-message view graphs. Both methods say “Only users can use this method.” [Broadcast stats](https://core.telegram.org/method/stats.getBroadcastStats), [message stats](https://core.telegram.org/method/stats.getMessageStats) | Rich metrics are not available through the existing bot-authenticated connector. |
| Access eligibility | Telegram says channel admins of a server-determined size can invoke stats methods; `can_view_stats` indicates availability, and requests use `channelFull.stats_dc`. [Channel statistics](https://core.telegram.org/api/stats) | Eligibility must be checked for the real owner channel; it cannot be assumed from bot admin status. |
| User authorization and policy | MTProto user auth associates subsequent API calls with the user's identity. Developers obtain `api_id`/`api_hash` through Telegram's API tools; Telegram says unofficial API clients' accounts are automatically put under observation. [User authorization](https://core.telegram.org/api/auth), [application credentials and warnings](https://core.telegram.org/api/obtaining_api_id) | A user session is a new credential class and trust boundary; it must not be stored or used by the Worker without a separate owner decision and security design. |

## Recommendation

Do not implement automated Telegram-native statistics in queue #14. Keep queue #13 scoped to Studio-owned publication history and the Bot API integration. If richer analytics is later needed, first obtain an explicit owner decision between manual import/entry and a separately designed MTProto user-client integration; the latter needs a threat model, session storage/lifecycle design, channel eligibility proof, data minimization and an independent R3 security review before any code.

## Unverified

- Whether the owner's actual channel currently exposes `can_view_stats` to the owner account.
- Exact graph-series availability, values and periods for that channel; Telegram controls eligibility and the data returned.
- Whether future-only membership/reaction event collection would be useful enough to justify another bot subscription and retention policy.
