import type { AiAuthorDotaDto, AiAuthorFields } from '@alexeev/contracts';

export interface StoredAuthorProfile {
  document: string;
  dota: string | null;
  dotaSyncedAt: number | null;
  revision: number;
  updatedAt: number;
}

export interface AuthorProfileRepository {
  read(): Promise<StoredAuthorProfile | null>;
  /** Guarded by the revision (0: no row yet); false when another save won. */
  save(input: { fields: AiAuthorFields; expectedRevision: number; now: number }): Promise<boolean>;
  /** Stores a Dota read; makes the row from `seed` when none exists yet. */
  saveDota(input: { dota: AiAuthorDotaDto; seed: AiAuthorFields; now: number }): Promise<void>;
}

export function createD1AuthorProfileRepository(db: D1Database): AuthorProfileRepository {
  return {
    async read() {
      return db
        .prepare(
          `SELECT document, dota, dota_synced_at AS dotaSyncedAt, revision, updated_at AS updatedAt
           FROM ai_author_profile WHERE id = 'owner'`
        )
        .first<StoredAuthorProfile>();
    },

    async save({ fields, expectedRevision, now }) {
      const document = JSON.stringify(fields);
      const result =
        expectedRevision === 0
          ? await db
              .prepare(
                `INSERT OR IGNORE INTO ai_author_profile (id, document, revision, updated_at) VALUES ('owner', ?, 1, ?)`
              )
              .bind(document, now)
              .run()
          : await db
              .prepare(
                `UPDATE ai_author_profile SET document = ?, revision = revision + 1, updated_at = ?
                 WHERE id = 'owner' AND revision = ?`
              )
              .bind(document, now, expectedRevision)
              .run();
      return result.meta.changes === 1;
    },

    async saveDota({ dota, seed, now }) {
      await db
        .prepare(
          `INSERT INTO ai_author_profile (id, document, dota, dota_synced_at, revision, updated_at)
           VALUES ('owner', ?1, ?2, ?3, 1, ?3)
           ON CONFLICT (id) DO UPDATE SET dota = ?2, dota_synced_at = ?3`
        )
        .bind(JSON.stringify(seed), JSON.stringify(dota), now)
        .run();
    }
  };
}
