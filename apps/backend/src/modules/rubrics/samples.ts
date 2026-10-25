import { fakeItem, filesDontLie, guessStreak, rateIt, rebus, tierListVote, workshopSet } from './content-rubrics';
import { comboMath, didYouKnow, guessByNumbers, itemExam, whoseAbility } from './game-rubrics';
import { nerfOrBuff, patchBroken, valveSeriously, valveTime, whoGetsNerfed, whoIsImba } from './patch-rubrics';
import {
  banOrPick,
  forgottenHero,
  guessWinrate,
  notBuiltYet,
  poisonForLow,
  rankMeta,
  tierList,
  whoBeatsWhom,
  whoseBuild
} from './stats-rubrics';
import type { RubricContext, RubricSample } from './types';

// The 32 rubrics of `.logs/rubrics-best.html` (owner, 25.10.2026: «мне надо все рубрики»), each built from live data
// the way the channel would show it. The texts are templates over real numbers, not the AI writer yet.

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
  daily_record: () => notBuiltYet('daily records of matches'),
  hero_peak: () => notBuiltYet('win rate by game length'),
  anti_build: () => notBuiltYet('item win rate by purchase time'),
  forgotten_hero: forgottenHero,
  did_you_know: didYouKnow,
  item_exam: itemExam,
  tier_list: tierList,
  carry_on_five: () => notBuiltYet('picks by position'),
  combo_math: comboMath,
  horoscope: () => notBuiltYet('week-over-week meta shifts'),
  workshop_set: workshopSet,
  rebus,
  guess_streak: guessStreak,
  tier_list_vote: tierListVote,
  guess_match: () => notBuiltYet('recent high-rank matches'),
  fake_item: fakeItem,
  whose_build: whoseBuild
};

export function buildRubricSample(key: RubricKey, context: RubricContext): Promise<RubricSample> {
  return BUILDERS[key](context);
}
