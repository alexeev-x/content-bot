import { z } from 'zod';

// The channel's rubrics, one list for the backend, the frontend and the API: keys in the order of the owner's numbers
// (01–30), titles as the channel shows them.

export const RUBRIC_KEYS = [
  'patch_broken',
  'who_is_imba',
  'nerf_or_buff',
  'whose_ability',
  'files_dont_lie',
  'who_gets_nerfed',
  'valve_seriously',
  'valve_time',
  'rate_it',
  'who_beats_whom',
  'workshop_set',
  'hero_guide',
  'confess',
  'explain_dumb',
  'toxic_translator',
  'ability_in_life',
  'hero_profile',
  'item_leaflet',
  'tier_list',
  'recruit_picks',
  'forgotten_hero',
  'horoscope',
  'hero_trial',
  'would_you_rather',
  'on_lane',
  'rebus',
  'toxic_bingo',
  'fake_item',
  'shame_of_day',
  'quote_of_day'
] as const;
export type RubricKey = (typeof RUBRIC_KEYS)[number];
export const rubricKeySchema = z.enum(RUBRIC_KEYS);

/** Each rubric's name as the channel shows it; the writer gets it with the facts. */
export const RUBRIC_TITLES: Record<RubricKey, string> = {
  patch_broken: 'Кого понерфили',
  who_is_imba: 'Кто теперь имба?',
  nerf_or_buff: 'Нерф или баф?',
  whose_ability: 'Чья способность?',
  files_dont_lie: 'Утечка недели',
  who_gets_nerfed: 'Кого понерфят?',
  valve_seriously: 'Valve, ты серьёзно?',
  valve_time: 'Валв-тайм',
  rate_it: 'Оцениваем',
  who_beats_whom: 'Кто кого перебьёт?',
  workshop_set: 'Сеты из мастерской',
  hero_guide: 'Гайд на героя',
  confess: 'Признавайтесь',
  explain_dumb: 'Объясни как дебилу',
  toxic_translator: 'Переводчик с токсичного',
  ability_in_life: 'Способность в жизнь',
  hero_profile: 'Анкета',
  item_leaflet: 'Инструкция по применению',
  tier_list: 'Тир-лист',
  recruit_picks: 'Что брать рекруту',
  forgotten_hero: 'Забытый герой',
  horoscope: 'Гороскоп',
  hero_trial: 'Подозреваемый',
  would_you_rather: 'Что выберешь?',
  on_lane: 'Ты на линии',
  rebus: 'Ребус',
  toxic_bingo: 'Токсик-бинго',
  fake_item: 'Предмет, которого нет',
  shame_of_day: 'Пидорок дня',
  quote_of_day: 'Цитата дня'
};
