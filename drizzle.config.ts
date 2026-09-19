import { defineConfig } from 'drizzle-kit';

/**
 * Таблицы описываются рядом со своим кодом (`table.ts`), а не в одном общем файле — вертикальные
 * слайсы остаются целыми. Glob по всему `src`, а не только по `modules`: свои таблицы есть и у
 * входа (дедуп апдейтов в `app/telegram`), и пропустить их — значит сгенерировать DROP TABLE.
 *
 * Миграции пишем в ту же папку, откуда их применяет wrangler, чтобы не заводить второй механизм:
 * `wrangler d1 migrations apply` берёт оттуда *.sql.
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/**/table.ts',
  out: './migrations',
  casing: 'snake_case',
});
