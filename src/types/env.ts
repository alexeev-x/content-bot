/**
 * Биндинги из wrangler.jsonc (сгенерированы `pnpm cf-typegen`) плюс секреты.
 * Ни того, ни другого пока нет: секрет объявляется здесь же, когда появляется код, которому
 * он нужен, и задаётся через `wrangler secret put` и `.dev.vars` — никогда через `vars`.
 */
export type Env = CloudflareBindings;

/** Значения, которые middleware кладёт в контекст запроса. */
export type Variables = {
  requestId: string;
};

/** Дженерик для Hono: `new Hono<AppEnv>()`. */
export type AppEnv = { Bindings: Env; Variables: Variables };
