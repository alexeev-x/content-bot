import { heroProfile } from './anketa';
import { forgottenHero } from './forgotten-hero';
import { horoscope } from './horoscope';
import { filesDontLie, rateIt, workshopSet } from './content-rubrics';
import { fakeItem } from './fake-item';
import { shameOfDay } from './shame-of-day';
import { quoteOfDay } from './quote-of-day';
import { rebus } from './rebus';
import { abilityInLife, confess, explainDumb, itemLeaflet, toxicTranslator, wouldYouRather } from './fun-rubrics';
import { whoseAbility } from './game-rubrics';
import { recruitPicks } from './recruit-picks';
import { nerfOrBuff, patchBroken, valveSeriously, valveTime, whoIsImba } from './patch-rubrics';
import { heroGuide, whoBeatsWhom, whoGetsNerfed } from './stats-rubrics';
import { onLane } from './on-lane';
import { suspect } from './suspect';
import { tierList } from './tier-list';
import { toxicBingo } from './toxic-bingo';
import { greetingCard } from './greeting-card';
import type { RubricContext, RubricSample } from './types';
import { RUBRIC_KEYS, RUBRIC_TITLES, type RubricKey } from '@alexeev/contracts';

export { RUBRIC_KEYS, RUBRIC_TITLES, type RubricKey };

// Each rubric built from live data the way the channel would show it; the AI writer rewrites the drafts (app/workflows).

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
  hero_trial: suspect,
  would_you_rather: wouldYouRather,
  on_lane: onLane,
  rebus,
  toxic_bingo: toxicBingo,
  fake_item: fakeItem,
  shame_of_day: shameOfDay,
  quote_of_day: quoteOfDay,
  greeting_card: greetingCard
};

export function buildRubricSample(key: RubricKey, context: RubricContext): Promise<RubricSample> {
  return BUILDERS[key](context);
}
