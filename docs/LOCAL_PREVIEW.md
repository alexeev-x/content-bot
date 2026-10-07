# Local development without Telegram sign-in

One command, `npm run dev`, on Windows or macOS starts the admin, the API, the bot webhook and Cron, and signs you straight into the admin as the owner, without Telegram.

## Why the normal sign-in fails on localhost

Browser sign-in uses the Telegram Login Widget. Telegram accepts it only on the domain linked to the bot in BotFather (`/setdomain`) and refuses `localhost`: the widget shows "Bot domain invalid" or does nothing. Do not change the bot's domain: that breaks sign-in on dev.

So on `npm run dev` the Telegram sign-in is replaced by a local one: the page asks the local server for an owner session (`OWNER_TELEGRAM_ID`). The owner menu shows the name «Локальная разработка».

## One-time setup

1. **Node.js 24** (the version in `.nvmrc`): https://nodejs.org, the 24.x installer.
2. In the project folder (PowerShell, the macOS terminal or the WebStorm terminal):

   ```powershell
   npm ci
   ```

## Run

```powershell
npm run dev
```

The command first applies pending migrations to the local database, then runs everything in one process. Open the address it prints (usually http://localhost:5173): you are already in the admin. Code changes reload live. Stop with `Ctrl + C`.

The data is real but local: posts, channels and settings live in `apps/backend/.wrangler/state` on your machine and are not connected to dev or production. Logout works; reloading the page signs you in again.

## Bot and sending to Telegram (optional)

Without a bot token the admin works but shows «Бот не настроен», and sending to channels is unavailable. To try the bot locally, copy the Telegram values from the root `.env.example` into `apps/backend/.dev.vars` and use the token of the **dev bot and a test channel**, never production ones. `.dev.vars` is gitignored.

Scheduled sending is off locally: `PUBLISHING_ENABLED` in `apps/backend/wrangler.jsonc` is `"false"`.

## Why this is safe for dev and production

- The local sign-in exists only under `npm run dev`. A build (`vite build`, CI, deploy) removes the code entirely: neither the Worker bundle nor the admin bundle contains it.
- Even if it got there, the server answers only requests to `localhost`, `127.0.0.1` or `[::1]`, while dev and production run on their own domains.
- Never start the dev server with `--host`: it would listen on the network, and anyone there could send `Host: localhost` and get an owner session on your local database.

## Screenshots on fixed test data

For repeatable screenshots there is a mock-API mode: always the same posts and channels, no database. It needs a regular Google Chrome.

- `npm run explore` opens Chrome on the Posts page. Browse and capture screens (`Win + Shift + S` on Windows, `Cmd + Shift + 4` on macOS). Close the window to end the command.
- The existing scenarios capture screens at 1280 and 375 px into a `shots` folder:

  ```powershell
  mkdir shots
  $env:SHOTS_DIR = "$PWD\shots"
  $env:E2E_SHOT_DIR = "$PWD\shots"
  npm run test:e2e -w @alexeev/frontend
  ```

  On macOS replace the `$env:` lines with `export SHOTS_DIR="$PWD/shots" E2E_SHOT_DIR="$PWD/shots"`. Do not commit `shots`.

In this mode actions missing from the mock API (for example creating a post) answer `404 not mocked`. That is expected; use `npm run dev` for real actions.

## Common problems

- **Port 5173 is busy**: Vite picks the next free port. Open the address the command prints.
- **`Owner is not configured` (503)**: `OWNER_TELEGRAM_ID` in `apps/backend/wrangler.jsonc` is empty.
- **You need the real Telegram sign-in**: open the dev environment in the browser. It runs the last deployed `develop`, not your local changes.
