# 3. Target repository structure

```text
content-bot/
├── apps/
│   ├── frontend/                      # admin UI: see FRONTEND_ARCHITECTURE.md
│   ├── backend/
│   │   ├── src/
│   │   │   ├── index.ts               # fetch / scheduled only
│   │   │   ├── app/
│   │   │   │   ├── create-app.ts      # Hono: middleware, /api/v1, /webhooks/telegram
│   │   │   │   ├── container.ts       # explicit per-request dependency wiring
│   │   │   │   ├── scheduled.ts       # Cron: reconcile → dispatch → archive → purge
│   │   │   │   ├── bot/               # Telegram inbound adapter: grammY Bot, owner's Telegram ID only
│   │   │   │   │   ├── create-bot.ts
│   │   │   │   │   └── commands/      # thin handlers → public module APIs
│   │   │   │   ├── env.ts             # types from `wrangler types`
│   │   │   │   └── workflows/
│   │   │   ├── modules/
│   │   │   │   ├── content/
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── domain/post.ts
│   │   │   │   │   ├── application/   # create-draft, update-draft, repository (port)
│   │   │   │   │   ├── infrastructure/d1-post-repository.ts
│   │   │   │   │   └── http/routes.ts
│   │   │   │   ├── publishing/
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── domain/        # publication.ts, state-machine.ts, status-projection.ts
│   │   │   │   │   ├── application/   # ports.ts, schedule.ts, dispatch.ts, reconcile.ts, resolve-unknown.ts
│   │   │   │   │   ├── infrastructure/ # d1-publication-repository.ts, telegram-publication-transport.ts, classify-telegram-result.ts
│   │   │   │   │   └── http/routes.ts
│   │   │   │   ├── lifecycle/
│   │   │   │   │   ├── index.ts
│   │   │   │   │   ├── domain/archive-policy.ts
│   │   │   │   │   ├── application/   # delete-posts.ts, restore-posts.ts, archive-posts.ts, ports.ts
│   │   │   │   │   └── infrastructure/d1-lifecycle-repository.ts
│   │   │   │   └── identity/
│   │   │   │       ├── index.ts
│   │   │   │       ├── application/   # verify-init-data.ts, verify-widget-data.ts, sessions.ts
│   │   │   │       ├── infrastructure/d1-session-repository.ts
│   │   │   │       └── http/auth-routes.ts
│   │   │   ├── integrations/
│   │   │   │   └── telegram/          # grammY Api factory without auto-retry; no module imports
│   │   │   ├── platform/              # database/, http/fetch-with-timeout.ts, security/, logging/, observability/, clock/
│   │   │   └── shared/                # app-error.ts, result.ts
│   │   ├── migrations/                # NNNN_<name>.sql
│   │   ├── tests/integration/
│   │   ├── wrangler.jsonc
│   │   └── vitest.config.ts
│   └── contracts/                     # Zod schemas and DTOs for the admin UI and API
├── docs/
├── .agents/                           # agent roles, skills, hooks
├── AGENTS.md
└── package.json                       # npm workspaces; versions in the lockfile
```

**No mandatory empty folders.** The tree is the target structure as implementation progresses; `dota-data` and `media` appear together with those capabilities. A simple module may consist of `index.ts`, `service.ts`, `service.test.ts`; split into layers when real complexity appears. Module tests live next to the module.

# 4. Contracts and explicit dependency injection

```ts
// publishing/application/ports.ts — the interface belongs to the consumer
export type SendOutcome =
  | { kind: 'sent'; externalMessageId: string }
  | { kind: 'rate_limited'; retryAfterSec: number }      // 429: Telegram refused, nothing was published
  | { kind: 'rejected'; code: 'CHAT_MIGRATED' | 'CONTENT_INVALID' | 'DESTINATION_UNAVAILABLE' }
  | { kind: 'unknown'; reason: string };                 // timeout, network, 5xx, ok without message_id

export interface PublicationTransport {
  send(input: { chatId: string; text: string; imageKey?: string }): Promise<SendOutcome>;
}

// app/container.ts — the ONLY place where real implementations are wired (per request/tick)
export function createPublishing(env: Env) {
  const api = createTelegramApi(env.TELEGRAM_BOT_TOKEN);      // grammY Api, no auto-retry
  const transport = new TelegramPublicationTransport(api);     // GrammyError/HttpError → SendOutcome
  const repo = new D1PublicationRepository(env.DB);
  return createPublishingService({ transport, repo, clock: systemClock });
}
```

The adapter does not throw exceptions outward: every Telegram response is turned into a `SendOutcome`, so the rule "unclear send → `unknown`" is visible in the types and verified by a test. It sends text, one photo/video/animation, or one ordered photo/video album using streaming `InputFile`s; album results keep every message ID. Do not construct a client holding user state in global scope and do not pass a raw secret to the logger. `PublicationTransport` does not become a "universal sender for all social networks": incompatible channels require a separate port.

Changing the Telegram client affects only the adapter and its tests, but **not the `publishing` domain model**. Adding a Dota provider means a new `DotaDataProvider` implementation, registration and contract tests.
