import {
  type AiAuthorDotaDto,
  type AiAuthorFields,
  aiAuthorDotaSchema,
  aiAuthorFieldsSchema,
  type AiAuthorProfileDto,
  type UpdateAiAuthorProfileInput
} from '@alexeev/contracts';
import type { Clock } from '../../platform/clock';
import { AppError } from '../../shared/app-error';
import type { AuthorProfileRepository } from './d1-author-repository';
import { type DotaProfileReader, DotaReadError } from './ports';

// «ИИ-редактор → Обо мне»: the author's current state (architecture item 6). Git holds only the seed
// (docs/ai/pack/state.md); the living version is this row, sent with every AI request after the stable prefix.
const DOTA_TIMEOUT_MS = 15_000;
/** Cron reads Dota again after this long (once a day, with slack for the tick). */
const DOTA_REFRESH_MS = 20 * 60 * 60 * 1000;

/** Before the first save: the seed of docs/ai/pack/state.md. */
const SEED: AiAuthorFields = {
  dotaAccountId: null,
  hours: null,
  learningHeroes: ['Феникс', 'Сайленсер', 'Оракл'],
  unknownAspects: '',
  experiments:
    'В «Учусь играть» открывать личным косяком или шуткой, а не описанием героя; в «Учу фидить» — мгновенный спорный тезис.',
  notes: ''
};

const MEDALS = ['Рекрут', 'Страж', 'Рыцарь', 'Герой', 'Легенда', 'Властелин', 'Божество', 'Титан'];

/** «Герой 2» from OpenDota's rank tier 42; null when unranked. */
export function rankLabel(rankTier: number | null): string | null {
  if (rankTier === null || rankTier < 10) return null;
  const medal = MEDALS[Math.floor(rankTier / 10) - 1];
  if (medal === undefined) return null;
  const stars = rankTier % 10;
  return stars > 0 && medal !== 'Титан' ? `${medal} ${stars}` : medal;
}

function parse<T>(raw: string | null, schema: { safeParse(value: unknown): { success: boolean; data?: T } }): T | null {
  if (raw === null) return null;
  try {
    const result = schema.safeParse(JSON.parse(raw));
    return result.success ? (result.data ?? null) : null;
  } catch {
    return null;
  }
}

export async function readAuthorProfile(repo: AuthorProfileRepository): Promise<AiAuthorProfileDto> {
  const row = await repo.read();
  const fields = (row && parse(row.document, aiAuthorFieldsSchema)) ?? SEED;
  const profile = {
    ...fields,
    dota: row ? parse<AiAuthorDotaDto>(row.dota, aiAuthorDotaSchema) : null,
    revision: row?.revision ?? 0,
    updatedAt: row ? new Date(row.updatedAt).toISOString() : null
  };
  return { ...profile, promptText: authorStateText(profile) };
}

export async function updateAuthorProfile(
  deps: { repo: AuthorProfileRepository; clock: Clock },
  input: UpdateAiAuthorProfileInput
): Promise<void> {
  const { revision, ...fields } = input;
  const saved = await deps.repo.save({ fields, expectedRevision: revision, now: deps.clock.now() });
  if (!saved) throw new AppError('CONFLICT', 'The profile changed', { reason: 'STALE_REVISION' });
}

/** Reads the owner's Dota profile now and stores it. */
export async function syncAuthorDota(deps: {
  repo: AuthorProfileRepository;
  clock: Clock;
  readDota: DotaProfileReader;
}): Promise<void> {
  const profile = await readAuthorProfile(deps.repo);
  if (profile.dotaAccountId === null)
    throw new AppError('UNAVAILABLE', 'No Dota account is set', { reason: 'NO_ACCOUNT' });
  let snapshot;
  try {
    snapshot = await deps.readDota(profile.dotaAccountId, AbortSignal.timeout(DOTA_TIMEOUT_MS));
  } catch (error) {
    if (!(error instanceof DotaReadError)) throw error;
    throw new AppError('UNAVAILABLE', 'OpenDota did not answer', { reason: 'DOTA_UNREACHABLE', code: error.code });
  }
  const now = deps.clock.now();
  const { revision: _revision, updatedAt: _updatedAt, dota: _dota, promptText: _promptText, ...fields } = profile;
  await deps.repo.saveDota({
    dota: { ...snapshot, rankLabel: rankLabel(snapshot.rankTier), fetchedAt: new Date(now).toISOString() },
    seed: fields,
    now
  });
}

/** Whether Cron should read Dota again: an account is set and the last read is a day old. */
export async function authorDotaDue(repo: AuthorProfileRepository, now: number): Promise<boolean> {
  const row = await repo.read();
  const fields = row && parse(row.document, aiAuthorFieldsSchema);
  return (
    Boolean(fields?.dotaAccountId) && (row?.dotaSyncedAt === null || now - (row?.dotaSyncedAt ?? 0) >= DOTA_REFRESH_MS)
  );
}

/** The author's state as the prompt reads it, in Russian. */
export function authorStateText(profile: Omit<AiAuthorProfileDto, 'promptText'>): string {
  const dota = profile.dota;
  const day = dota ? new Date(dota.fetchedAt).toISOString().slice(0, 10).split('-').reverse().join('.') : null;
  const lines = [
    dota?.rankLabel ? `- Ранг: ${dota.rankLabel} (по OpenDota на ${day}).` : '',
    profile.hours !== null ? `- В Доте около ${profile.hours} часов.` : '',
    dota && dota.publicMatchData && dota.topHeroes.length > 0
      ? `- Чаще всего играет: ${dota.topHeroes
          .map((hero) => `${hero.name} (${hero.games} игр, ${Math.round(hero.winRate * 100)}% побед)`)
          .join(', ')}.`
      : '',
    profile.learningHeroes.length > 0 ? `- Сейчас учит героев: ${profile.learningHeroes.join(', ')}.` : '',
    profile.unknownAspects.trim() ? `- Пока не понимает в игре: ${profile.unknownAspects.trim()}` : '',
    profile.experiments.trim() ? `- Текущие эксперименты рубрик: ${profile.experiments.trim()}` : '',
    profile.notes.trim() ? `- Сейчас актуально: ${profile.notes.trim()}` : ''
  ].filter(Boolean);
  return lines.length === 0
    ? ''
    : `СОСТОЯНИЕ АВТОРА (сейчас, из студии; опыт не выдумывай сверх этого):\n${lines.join('\n')}`;
}
