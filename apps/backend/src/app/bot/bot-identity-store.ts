import type { UserFromGetMe } from 'grammy/types';
import type { Logger } from '../../platform/logging/logger';
import { AppError } from '../../shared/app-error';
import { parseBotInfoJson } from './bot-info';

// Where the Worker keeps the bot's own `getMe` answer, so the webhook never has to ask Telegram.
export interface BotIdentityStore {
  /** The stored identity, or null when none was saved or the row is no longer valid. */
  load(): Promise<UserFromGetMe | null>;
  /** Replaces the single row; repeating it with the same identity changes nothing but the time. */
  save(info: UserFromGetMe, now: number): Promise<void>;
}

// Code deployed before migration 0007 reaches a database without the table. That is an expected
// deploy-order state, not a crash: answer 503 with a reason the owner can act on.
async function guardMigration<T>(logger: Logger, operation: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Error && /no such table/i.test(error.message)) {
      logger.warn({ component: 'bot', operation, errorCode: 'MIGRATION_PENDING' });
      throw new AppError('UNAVAILABLE', 'Database migration is pending', { reason: 'MIGRATION_PENDING' });
    }
    throw error;
  }
}

export function createD1BotIdentityStore(db: D1Database, logger: Logger): BotIdentityStore {
  return {
    async load() {
      const row = await guardMigration(logger, 'bot_identity.load', () =>
        db.prepare('SELECT info FROM bot_identity WHERE id = 1').first<{ info: string }>()
      );
      if (row === null) return null;
      const info = parseBotInfoJson(row.info);
      // Never the stored text: only the fact that the row is unusable (connecting again rewrites it).
      if (info === null)
        logger.warn({ component: 'bot', operation: 'bot_identity.load', errorCode: 'BOT_IDENTITY_CORRUPT' });
      return info;
    },
    async save(info, now) {
      await guardMigration(logger, 'bot_identity.save', () =>
        db
          .prepare(
            `INSERT INTO bot_identity (id, bot_id, info, updated_at) VALUES (1, ?1, ?2, ?3)
             ON CONFLICT (id) DO UPDATE SET bot_id = excluded.bot_id, info = excluded.info, updated_at = excluded.updated_at`
          )
          .bind(info.id, JSON.stringify(info), now)
          .run()
      );
    }
  };
}
