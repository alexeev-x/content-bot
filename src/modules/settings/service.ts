import { AppError } from 'src/lib/errors';
import { readAiSettings, writeAiSettings } from './queries';

export const models = ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-6-astra'] as const;
export const efforts = ['none', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export type AiModel = (typeof models)[number];
export type AiEffort = (typeof efforts)[number];
export type AiSettings = { model: AiModel; effort: AiEffort };

/** Временно экономный старт для dev: качество сравним на реальных текстах до повышения модели. */
const defaults: AiSettings = { model: 'gpt-5.6-luna', effort: 'low' };

export const createSettingsService = ({ d1 }: { d1: D1Database }) => ({
  ai: async (): Promise<AiSettings> => {
    const row = await readAiSettings(d1);
    if (!row || !models.includes(row.model as AiModel) || !efforts.includes(row.effort as AiEffort)) return defaults;
    return { model: row.model as AiModel, effort: row.effort as AiEffort };
  },
  model: (model: string) => {
    if (!models.includes(model as AiModel)) throw new AppError('bad_request', 'Неизвестная модель');
    return model as AiModel;
  },
  effort: (model: AiModel, effort: string) => {
    if (!efforts.includes(effort as AiEffort) || (model === 'gpt-6-astra' && effort === 'none'))
      throw new AppError('bad_request', 'Недопустимый уровень reasoning');
    return effort as AiEffort;
  },
  save: async (model: AiModel, effort: AiEffort) => writeAiSettings(d1, model, effort),
});
