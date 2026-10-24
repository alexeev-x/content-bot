import {
  type AiAuthorDotaDto,
  type AiAuthorFields,
  aiAuthorDotaSchema,
  aiAuthorFieldsSchema,
  type AiAuthorProfileDto,
  type AiDotaSnapshotInput,
  type UpdateAiAuthorProfileInput
} from '@alexeev/contracts';
import type { Clock } from '../../platform/clock';
import { AppError } from '../../shared/app-error';
import type { AuthorProfileRepository } from './d1-author-repository';

// «ИИ-редактор → Обо мне»: the author's current state (architecture item 6). Git holds only the seed
// (docs/ai/pack/state.md); the living version is this row, sent with every AI request after the stable prefix.

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

/** Stores a read of the owner's Dota profile (made by the studio in the owner's browser). */
export async function saveAuthorDota(
  deps: { repo: AuthorProfileRepository; clock: Clock },
  snapshot: AiDotaSnapshotInput
): Promise<void> {
  const profile = await readAuthorProfile(deps.repo);
  if (profile.dotaAccountId === null)
    throw new AppError('CONFLICT', 'No Dota account is set', { reason: 'NO_ACCOUNT' });
  const now = deps.clock.now();
  const { revision: _revision, updatedAt: _updatedAt, dota: _dota, promptText: _promptText, ...fields } = profile;
  await deps.repo.saveDota({
    dota: { ...snapshot, rankLabel: rankLabel(snapshot.rankTier), fetchedAt: new Date(now).toISOString() },
    seed: fields,
    now
  });
}

/** The author's state as the prompt reads it, in Russian. */
/**
 * The state is background for the model, never the post's material: «опыт не выдумывай сверх этого» read as
 * leave to write the listed heroes as the author's experience («я кнопки на Оракле читаю» in a post about
 * turbo, owner 16.10.2026).
 */
export const AUTHOR_STATE_HEADER =
  'СОСТОЯНИЕ АВТОРА (фон, не тема: не вставляй в текст героев, ранг и эксперименты отсюда, если автор сам не написал о них в задании; опыт берётся только из задания):';

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
  return lines.length === 0 ? '' : `${AUTHOR_STATE_HEADER}\n${lines.join('\n')}`;
}
