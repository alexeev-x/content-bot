import { fakeItem, filesDontLie, guessStreak, rateIt, rebus, tierListVote, workshopSet } from './content-rubrics';
import { comboMath, didYouKnow, guessByNumbers, itemExam, whoseAbility } from './game-rubrics';
import { nerfOrBuff, patchBroken, valveSeriously, valveTime, whoGetsNerfed, whoIsImba } from './patch-rubrics';
import {
  antiBuild,
  banOrPick,
  carryOnFive,
  forgottenHero,
  guessWinrate,
  heroPeak,
  horoscope,
  notBuiltYet,
  poisonForLow,
  rankMeta,
  tierList,
  weeklyRecord,
  whoBeatsWhom,
  whoseBuild
} from './stats-rubrics';
import type { RubricContext, RubricSample } from './types';

// The 32 rubrics of `.logs/rubrics-best.html` (owner, 25.10.2026: «мне надо все рубрики»), each built from live data
// the way the channel would show it. The texts are drafts over real numbers; the AI writer rewrites them (app/workflows).

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
  'guess_by_numbers',
  'guess_winrate',
  'ban_or_pick',
  'rank_meta',
  'poison_for_low',
  'daily_record',
  'hero_peak',
  'anti_build',
  'forgotten_hero',
  'did_you_know',
  'item_exam',
  'tier_list',
  'carry_on_five',
  'combo_math',
  'horoscope',
  'workshop_set',
  'rebus',
  'guess_streak',
  'tier_list_vote',
  'guess_match',
  'fake_item',
  'whose_build'
] as const;
export type RubricKey = (typeof RUBRIC_KEYS)[number];

/** Each rubric's name as the channel shows it; the writer gets it with the facts. */
export const RUBRIC_TITLES: Record<RubricKey, string> = {
  patch_broken: 'Что сломали в патче',
  who_is_imba: 'Кто теперь имба?',
  nerf_or_buff: 'Нерф или баф?',
  whose_ability: 'Чья способность?',
  files_dont_lie: 'Файлы не врут',
  who_gets_nerfed: 'Кого понерфят?',
  valve_seriously: 'Valve, ты серьёзно?',
  valve_time: 'Валв-тайм',
  rate_it: 'Оцениваем',
  who_beats_whom: 'Кто кого перебьёт?',
  guess_by_numbers: 'Угадай героя по цифрам',
  guess_winrate: 'Угадай винрейт',
  ban_or_pick: 'Бан или пик?',
  rank_meta: 'Мета по рангам',
  poison_for_low: 'Яд для низов',
  daily_record: 'Рекорд недели',
  hero_peak: 'Когда герой сильнее всего',
  anti_build: 'Антисборка',
  forgotten_hero: 'Забытый герой',
  did_you_know: 'А вы знали?',
  item_exam: 'Предметный экзамен',
  tier_list: 'Тир-лист по-русски',
  carry_on_five: 'Керри на пятой',
  combo_math: 'Комбо-расчёт',
  horoscope: 'Дота-гороскоп',
  workshop_set: 'Оцени сет из мастерской',
  rebus: 'Ребус',
  guess_streak: 'Угадай-серия',
  tier_list_vote: 'Тир-лист голосованием',
  guess_match: 'Угадай матч',
  fake_item: 'Шемелис недели',
  whose_build: 'Чья сборка?'
};

const BUILDERS: Record<RubricKey, (context: RubricContext) => Promise<RubricSample>> = {
  patch_broken: patchBroken,
  who_is_imba: whoIsImba,
  nerf_or_buff: nerfOrBuff,
  whose_ability: whoseAbility,
  files_dont_lie: filesDontLie,
  who_gets_nerfed: whoGetsNerfed,
  valve_seriously: valveSeriously,
  valve_time: valveTime,
  rate_it: rateIt,
  who_beats_whom: whoBeatsWhom,
  guess_by_numbers: guessByNumbers,
  guess_winrate: guessWinrate,
  ban_or_pick: banOrPick,
  rank_meta: rankMeta,
  poison_for_low: poisonForLow,
  daily_record: weeklyRecord,
  hero_peak: heroPeak,
  anti_build: antiBuild,
  forgotten_hero: forgottenHero,
  did_you_know: didYouKnow,
  item_exam: itemExam,
  tier_list: tierList,
  carry_on_five: carryOnFive,
  combo_math: comboMath,
  horoscope,
  workshop_set: workshopSet,
  rebus,
  guess_streak: guessStreak,
  tier_list_vote: tierListVote,
  // STRATZ's live matches came back empty (25.10.2026); a source of recent high-rank matches is still to find.
  guess_match: () => notBuiltYet('recent high-rank matches'),
  fake_item: fakeItem,
  whose_build: whoseBuild
};

export function buildRubricSample(key: RubricKey, context: RubricContext): Promise<RubricSample> {
  return BUILDERS[key](context);
}
