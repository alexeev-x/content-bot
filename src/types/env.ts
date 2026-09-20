/** Секреты. В wrangler.jsonc их нет — задаются через `wrangler secret put` и .dev.vars. */
export type Secrets = {
  BOT_TOKEN: string;
  OWNER_TELEGRAM_ID: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  OPENAI_API_KEY?: string;
};

/**
 * Биндинги из wrangler.jsonc (сгенерированы `pnpm cf-typegen`) + секреты.
 * Типы генерируются для `--env dev`: биндинги, объявленные внутри env, иначе стали бы
 * опциональными. Формы dev и production держим одинаковыми — деплой всегда с явным окружением.
 */
export type Env = CloudflareBindings & Secrets;

/** Значения, которые middleware кладёт в контекст запроса. */
export type Variables = {
  requestId: string;
};

/** Дженерик для Hono: `new Hono<AppEnv>()`. */
export type AppEnv = { Bindings: Env; Variables: Variables };
