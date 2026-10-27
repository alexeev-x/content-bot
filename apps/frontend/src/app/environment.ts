// Build-time environment marker. vite.config.ts defines __APP_ENV__ from CLOUDFLARE_ENV (CI sets it to
// `production` on main and `dev` on develop); a local `vite dev` has none. Anything that is not exactly
// `production` shows the DEV badge, so a missing value errs on the visible side.
declare const __APP_ENV__: string | undefined;

export type AppEnvironment = 'production' | 'dev' | 'local';

export function readAppEnvironment(): AppEnvironment {
  const raw = typeof __APP_ENV__ === 'string' ? __APP_ENV__ : '';
  return raw === 'production' ? 'production' : raw === 'dev' ? 'dev' : 'local';
}

export const showEnvironmentBadge = (environment: AppEnvironment) => environment !== 'production';

// Login Widget bot username, injected by vite.config.ts (single {dev, production} mapping there). Absent only in
// tooling that bypasses Vite (tests), where the login page shows its «bot not configured» error.
declare const __TELEGRAM_BOT_USERNAME__: string | undefined;

const BOT_USERNAME = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;

/** Valid bot username or undefined; a leading «@» is tolerated. */
export function readTelegramBotUsername(): string | undefined {
  const raw = typeof __TELEGRAM_BOT_USERNAME__ === 'string' ? __TELEGRAM_BOT_USERNAME__.replace(/^@/, '') : '';
  return BOT_USERNAME.test(raw) ? raw : undefined;
}

// «Тестирование» (owner, 26.10.2026): true under Vite unless CLOUDFLARE_ENV=production (vite.config.ts); tests have none.
declare const __LAB__: boolean | undefined;

export const isLabBuild = () => typeof __LAB__ === 'boolean' && __LAB__;
