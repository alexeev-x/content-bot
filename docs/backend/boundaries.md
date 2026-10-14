# 2. Boundaries: who owns what

| Area | Responsibility | Forbidden |
|---|---|---|
| `content` | drafts, publication content and format, plus post-attached media identity and order | calling Telegram, Cron, R2 directly |
| `publishing` | publication, schedule, state, retries, `jobs`, destinations (channel, group) | computing Dota statistics itself, storing raw images |
| `app/bot` (inbound adapter, not a business module) | parsing Telegram commands and button presses, replying to the owner; like HTTP routes and Cron, it calls only the public APIs of modules | business logic, direct SQL, replying to commands not from the owner; no module imports `app/bot` |
| `identity` | the owner (Telegram ID from settings), sign-in via Mini App `initData` and the Telegram Login Widget, sessions | trusting data without signature verification, logging `initData`, tokens and codes |
| `dota-data` (later) | fetch/normalize/cache statistics with a date and source | sending messages and managing the schedule |
| `media` (later) | a cross-post media library/catalog and card creation | determining post time, calling Telegram |
| `app/workflows` | coordination of two or more capabilities | SQL, HTTP Bot API, dependency on internal module files |
| `integrations` | low-level clients: Telegram (grammY), later Dota and render | making business decisions |
| `platform` | D1, R2, clock, logger, rate limit, HTTP client, security middleware | business entities and "magic" dependencies on modules |

Telegram is an **integration**, not a business module. `publishing` owns the `PublicationTransport` port; its adapter uses the grammY `Api` and translates responses into explicit outcomes (§5). Incoming updates are parsed by the inbound adapter `app/bot` (grammY `Bot` + `webhookCallback`). It is an entry point at the same level as HTTP routes and Cron: it only understands a command and calls the public APIs of `content`/`publishing`, so business modules depend neither on the bot nor on each other beyond public `index.ts` files. The bot is personal: commands and buttons are accepted only from the owner's Telegram ID, all others are silently ignored; the command menu is set only for the owner's private chat. In the owner's group the bot is an administrator with minimal rights (sending messages and media, pinning if needed). Error notifications to the owner go through a separate `AlertNotifier` port.

**Strict boundary rule (owner decision 03.10.2026): modules do not import each other.** A module's public `index.ts` is imported only by the `app/` layer: routes, `app/bot`, `scheduled.ts`, `app/workflows` and `container.ts`. If a module needs another's data, it declares a port of its own, and `container.ts` connects the other module's public API to it. Example: `publishing` declares `PostSource { findState(postId) }` (status and current revision), and `container.ts` passes a function from `content` into it — `publishing` knows nothing about `content`. A multi-module scenario goes in `app/workflows`. Deep imports and cycles are forbidden. The rule is checked by dependency-cruiser (`modules/*` → `modules/*` is an error), so a violation is caught without review. Long-running or deferred work is a job record in D1 that Cron picks up. A simple module does not grow four layers without need.

Post-attached media remains part of `content`: it owns draft attachment identity, order and the immutable approved snapshot. Content declares its own object-storage port; only the `app/container.ts` composition root wires that port to the Cloudflare R2 adapter. A future `media` module is for a separate searchable media library, not a second owner of post attachments.
