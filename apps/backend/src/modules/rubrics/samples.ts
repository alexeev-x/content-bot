import { heroProfile } from './anketa';
import { forgottenHero } from './forgotten-hero';
import { horoscope } from './horoscope';
import { fakeItem, filesDontLie, rateIt, rebus, workshopSet } from './content-rubrics';
import {
  abilityInLife,
  confess,
  explainDumb,
  itemLeaflet,
  onLane,
  toxicBingo,
  toxicTranslator,
  trashTier,
  whatIf,
  wouldYouRather
} from './fun-rubrics';
import { whoseAbility } from './game-rubrics';
import { recruitPicks } from './recruit-picks';
import { grandpa, nerfOrBuff, patchBroken, valveFixed, valveSeriously, valveTime, whoIsImba } from './patch-rubrics';
import { heroGuide, heroTrial, notBuiltYet, whoBeatsWhom, whoGetsNerfed } from './stats-rubrics';
import { tierList } from './tier-list';
import type { RubricContext, RubricSample } from './types';

// The channel's rubrics, each built from live data the way the channel would show it: 01–10 approved by the owner, the
// rest the new list (owner, 27.10.2026: «замени текущие… пока просто общее сделай, потом каждый по одному»). The texts
// are drafts over real numbers; the AI writer rewrites them (app/workflows).

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
  'what_if',
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
  'grandpa',
  'valve_fixed',
  'rebus',
  'toxic_bingo',
  'trash_tier',
  'fake_item',
  'confessional'
] as const;
export type RubricKey = (typeof RUBRIC_KEYS)[number];

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
  what_if: 'Что если…',
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
  hero_trial: 'Суд',
  would_you_rather: 'Что выберешь?',
  on_lane: 'Ты на линии',
  grandpa: 'Дед',
  valve_fixed: 'Valve исправила',
  rebus: 'Ребус',
  toxic_bingo: 'Токсик-бинго',
  trash_tier: 'Тир-лист хуйни',
  fake_item: 'Предмет, которого нет',
  confessional: 'Исповедальня'
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
  workshop_set: workshopSet,
  hero_guide: heroGuide,
  what_if: whatIf,
  confess,
  explain_dumb: explainDumb,
  toxic_translator: toxicTranslator,
  ability_in_life: abilityInLife,
  hero_profile: heroProfile,
  item_leaflet: itemLeaflet,
  tier_list: tierList,
  recruit_picks: recruitPicks,
  forgotten_hero: forgottenHero,
  horoscope,
  hero_trial: heroTrial,
  would_you_rather: wouldYouRather,
  on_lane: onLane,
  grandpa,
  valve_fixed: valveFixed,
  rebus,
  toxic_bingo: toxicBingo,
  trash_tier: trashTier,
  fake_item: fakeItem,
  // Subscribers' confessions come through the channel's direct messages, which the bot does not read yet.
  confessional: () => notBuiltYet('subscribers’ confessions via the channel’s direct messages')
};

export function buildRubricSample(key: RubricKey, context: RubricContext): Promise<RubricSample> {
  return BUILDERS[key](context);
}
