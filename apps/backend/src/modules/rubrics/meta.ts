import type { RubricKey } from '@alexeev/contracts';
import type { DegradationCode } from './degradations';

// What the scheduler knows about each rubric without loading its banks: the owner's inner rules as data
// (docs/rubrics/RUBRICS_SCHEDULER.md «Per approved rubric», table in docs/scheduler/area-backend-rubrics.md §1.3).

/** What a rubric needs at run time; a missing one makes it no candidate (never a notice). */
export type Need = 'browser' | 'ai_text' | 'ai_image' | 'ai_upscale' | 'stratz' | 'stats_db';

export type RubricFamily =
  'patch' | 'stats' | 'ai_scene' | 'cosmetic' | 'guess' | 'text_bank' | 'joke_poll' | 'leak' | 'picture_bank';

/** Moscow time windows: `{fromMsk,toMsk}` as `HH:MM`, `exact` an anchor minute. */
export type RubricSlot =
  | 'day'
  | 'evening'
  | 'any'
  | 'weekend'
  | 'fri_evening'
  | 'fri_sat_evening'
  | { fromMsk: string; toMsk: string }
  | { exactMsk: string };

export interface RubricMeta {
  /** The owner's number, 1–30. */
  number: number;
  family: RubricFamily;
  /** V = a picture post, L = a light text post; V_or_L picks per variant. */
  weight: 'V' | 'L' | 'V_or_L';
  interactive: boolean;
  trigger: 'chain' | 'event' | 'anchor' | 'pool';
  needs: Need[];
  /** A variant's own needs where they differ from `needs`. */
  needsByVariant?: Record<string, Need[]>;
  /** Degradations the post may still go out with; any other fails the candidate in production. */
  allowDegrade: DegradationCode[];
  /** Base rest in days (7–60); null for chain and event rubrics, which follow their trigger. */
  restDays: number | null;
  slot: RubricSlot;
  /** A bank rubric: a new round when it is used up, or a pause until the owner adds entries. */
  bank?: { name: string; exhaust: 'new_round' | 'pause' };
  poll?: { kind: 'regular' | 'quiz'; closeAfterHours: 24 | 168; inPicture: boolean };
  /** Quiet for this many days after a patch (old numbers). */
  silentAfterPatchDays?: number;
  /** `cross72h`: the post's hero must not have been in any rubric post of the last 72 h. */
  heroGate: 'cross72h' | 'none';
  /** Rubrics this one never shares a Moscow day with. */
  sameDay: RubricKey[];
  /** Rubrics this one never shares a week with. */
  sameWeek?: RubricKey[];
  /** At least this many days from another rubric (hours where the docs say hours: `days` may be fractional). */
  apart?: { key: RubricKey; days: number }[];
  /** Browser screenshots and AI calls per post with its follow-ups: the budgets of stage P. */
  browserCalls: number;
  aiCalls: { text: number; image: number };
}

const STATS: RubricKey[] = [
  'who_beats_whom',
  'hero_guide',
  'tier_list',
  'recruit_picks',
  'forgotten_hero',
  'shame_of_day'
];
const SCENES: RubricKey[] = ['hero_profile', 'forgotten_hero', 'horoscope', 'hero_trial'];
const others = (list: RubricKey[], self: RubricKey) => list.filter((key) => key !== self);

export const RUBRIC_META: Record<RubricKey, RubricMeta> = {
  patch_broken: {
    number: 1,
    family: 'patch',
    weight: 'V',
    interactive: false,
    trigger: 'chain',
    needs: ['browser', 'ai_text'],
    allowDegrade: [],
    restDays: null,
    slot: 'day',
    heroGate: 'none',
    sameDay: [],
    browserCalls: 1,
    aiCalls: { text: 1, image: 0 }
  },
  who_is_imba: {
    number: 2,
    family: 'patch',
    weight: 'V',
    interactive: true,
    trigger: 'chain',
    needs: ['browser', 'ai_text'],
    allowDegrade: [],
    restDays: null,
    slot: 'evening',
    poll: { kind: 'regular', closeAfterHours: 24, inPicture: false },
    heroGate: 'none',
    sameDay: [],
    apart: [{ key: 'nerf_or_buff', days: 40 / 24 }],
    browserCalls: 1,
    aiCalls: { text: 1, image: 0 }
  },
  nerf_or_buff: {
    number: 3,
    family: 'patch',
    weight: 'V',
    interactive: true,
    trigger: 'chain',
    needs: ['browser'],
    allowDegrade: [],
    restDays: null,
    slot: 'day',
    poll: { kind: 'regular', closeAfterHours: 24, inPicture: true },
    heroGate: 'none',
    sameDay: [],
    apart: [{ key: 'who_is_imba', days: 40 / 24 }],
    browserCalls: 1,
    aiCalls: { text: 0, image: 0 }
  },
  whose_ability: {
    number: 4,
    family: 'guess',
    weight: 'V',
    interactive: true,
    trigger: 'pool',
    needs: ['browser'],
    allowDegrade: [],
    restDays: 14,
    slot: { fromMsk: '08:00', toMsk: '15:30' },
    heroGate: 'none',
    sameDay: ['on_lane', 'rebus'],
    browserCalls: 2,
    aiCalls: { text: 0, image: 0 }
  },
  files_dont_lie: {
    number: 5,
    family: 'leak',
    weight: 'V',
    interactive: false,
    trigger: 'event',
    needs: ['browser', 'ai_text'],
    allowDegrade: [],
    restDays: 7,
    slot: 'fri_evening',
    heroGate: 'none',
    sameDay: [],
    browserCalls: 1,
    aiCalls: { text: 1, image: 0 }
  },
  who_gets_nerfed: {
    number: 6,
    family: 'patch',
    weight: 'V',
    interactive: true,
    trigger: 'event',
    needs: ['browser', 'ai_text', 'stratz'],
    allowDegrade: [],
    restDays: null,
    slot: 'day',
    poll: { kind: 'regular', closeAfterHours: 168, inPicture: false },
    silentAfterPatchDays: 21,
    heroGate: 'none',
    sameDay: [],
    apart: [{ key: 'valve_time', days: 3 }],
    browserCalls: 2,
    aiCalls: { text: 2, image: 0 }
  },
  valve_seriously: {
    number: 7,
    family: 'patch',
    weight: 'V_or_L',
    interactive: true,
    trigger: 'chain',
    needs: ['ai_text'],
    needsByVariant: { picture: ['browser', 'ai_text'] },
    allowDegrade: [],
    restDays: null,
    slot: 'evening',
    poll: { kind: 'regular', closeAfterHours: 24, inPicture: false },
    heroGate: 'none',
    sameDay: [],
    browserCalls: 1,
    aiCalls: { text: 1, image: 0 }
  },
  valve_time: {
    number: 8,
    family: 'patch',
    weight: 'V',
    interactive: false,
    trigger: 'event',
    needs: ['browser', 'ai_text'],
    allowDegrade: [],
    restDays: null,
    slot: 'day',
    heroGate: 'none',
    sameDay: [],
    apart: [{ key: 'who_gets_nerfed', days: 3 }],
    browserCalls: 1,
    aiCalls: { text: 1, image: 0 }
  },
  rate_it: {
    number: 9,
    family: 'cosmetic',
    weight: 'V',
    interactive: true,
    trigger: 'event',
    needs: ['ai_text', 'ai_upscale'],
    allowDegrade: [],
    restDays: null,
    slot: 'evening',
    poll: { kind: 'regular', closeAfterHours: 24, inPicture: false },
    heroGate: 'none',
    sameDay: [],
    apart: [{ key: 'workshop_set', days: 3 }],
    browserCalls: 0,
    aiCalls: { text: 1, image: 1 }
  },
  who_beats_whom: {
    number: 10,
    family: 'stats',
    weight: 'V',
    interactive: false,
    trigger: 'pool',
    needs: ['browser'],
    needsByVariant: { real: ['browser', 'stratz'] },
    allowDegrade: [],
    restDays: 21,
    slot: 'evening',
    silentAfterPatchDays: 7,
    heroGate: 'cross72h',
    sameDay: others(STATS, 'who_beats_whom'),
    browserCalls: 1,
    aiCalls: { text: 0, image: 0 }
  },
  workshop_set: {
    number: 11,
    family: 'cosmetic',
    weight: 'V',
    interactive: false,
    trigger: 'pool',
    needs: ['ai_text', 'ai_upscale'],
    allowDegrade: ['ALBUM_PHOTO_MISSING'],
    restDays: 21,
    slot: 'any',
    heroGate: 'cross72h',
    sameDay: [],
    apart: [{ key: 'rate_it', days: 3 }],
    browserCalls: 0,
    aiCalls: { text: 1, image: 0 }
  },
  hero_guide: {
    number: 12,
    family: 'stats',
    weight: 'V',
    interactive: false,
    trigger: 'pool',
    needs: ['browser', 'ai_text', 'stratz', 'stats_db'],
    allowDegrade: ['GUIDE_BLOCK_MISSING', 'GUIDE_SOURCE_FALLBACK', 'GUIDE_BASE_TOO_SMALL'],
    restDays: 9,
    slot: 'weekend',
    silentAfterPatchDays: 7,
    heroGate: 'cross72h',
    sameDay: others(STATS, 'hero_guide'),
    browserCalls: 3,
    aiCalls: { text: 1, image: 0 }
  },
  confess: {
    number: 13,
    family: 'text_bank',
    weight: 'L',
    interactive: false,
    trigger: 'pool',
    needs: [],
    allowDegrade: [],
    restDays: 14,
    slot: 'any',
    bank: { name: 'confess', exhaust: 'new_round' },
    heroGate: 'none',
    sameDay: ['quote_of_day'],
    sameWeek: ['would_you_rather'],
    browserCalls: 0,
    aiCalls: { text: 2, image: 0 }
  },
  explain_dumb: {
    number: 14,
    family: 'text_bank',
    weight: 'L',
    interactive: false,
    trigger: 'pool',
    needs: [],
    allowDegrade: [],
    restDays: 21,
    slot: 'any',
    bank: { name: 'explain_dumb', exhaust: 'new_round' },
    heroGate: 'none',
    sameDay: ['item_leaflet', 'quote_of_day'],
    browserCalls: 0,
    aiCalls: { text: 2, image: 0 }
  },
  toxic_translator: {
    number: 15,
    family: 'text_bank',
    weight: 'L',
    interactive: false,
    trigger: 'pool',
    needs: [],
    allowDegrade: [],
    restDays: 14,
    slot: 'evening',
    bank: { name: 'toxic_translator', exhaust: 'new_round' },
    heroGate: 'none',
    sameDay: ['toxic_bingo'],
    browserCalls: 0,
    aiCalls: { text: 0, image: 0 }
  },
  ability_in_life: {
    number: 16,
    family: 'joke_poll',
    weight: 'L',
    interactive: true,
    trigger: 'pool',
    needs: [],
    allowDegrade: [],
    restDays: 14,
    slot: 'day',
    bank: { name: 'ability_in_life', exhaust: 'new_round' },
    poll: { kind: 'regular', closeAfterHours: 24, inPicture: false },
    heroGate: 'none',
    sameDay: ['would_you_rather'],
    browserCalls: 0,
    aiCalls: { text: 0, image: 0 }
  },
  hero_profile: {
    number: 17,
    family: 'ai_scene',
    weight: 'V',
    interactive: false,
    trigger: 'pool',
    needs: ['browser', 'ai_image'],
    allowDegrade: [],
    restDays: 21,
    slot: 'fri_sat_evening',
    bank: { name: 'hero_profile', exhaust: 'new_round' },
    heroGate: 'cross72h',
    sameDay: others(SCENES, 'hero_profile'),
    browserCalls: 1,
    aiCalls: { text: 0, image: 1 }
  },
  item_leaflet: {
    number: 18,
    family: 'text_bank',
    weight: 'L',
    interactive: false,
    trigger: 'pool',
    needs: [],
    allowDegrade: [],
    restDays: 21,
    slot: 'any',
    bank: { name: 'item_leaflet', exhaust: 'new_round' },
    heroGate: 'none',
    sameDay: ['explain_dumb', 'fake_item'],
    browserCalls: 0,
    aiCalls: { text: 0, image: 0 }
  },
  tier_list: {
    number: 19,
    family: 'stats',
    weight: 'V',
    interactive: false,
    trigger: 'pool',
    needs: ['browser', 'stratz'],
    allowDegrade: [],
    restDays: 30,
    slot: 'any',
    silentAfterPatchDays: 7,
    heroGate: 'none',
    sameDay: [...others(STATS, 'tier_list'), 'toxic_bingo'],
    browserCalls: 1,
    aiCalls: { text: 0, image: 0 }
  },
  recruit_picks: {
    number: 20,
    family: 'stats',
    weight: 'V',
    interactive: false,
    trigger: 'pool',
    needs: ['browser', 'ai_text', 'stratz'],
    allowDegrade: [],
    restDays: 30,
    slot: { fromMsk: '18:00', toMsk: '19:00' },
    silentAfterPatchDays: 7,
    heroGate: 'cross72h',
    sameDay: others(STATS, 'recruit_picks'),
    browserCalls: 1,
    aiCalls: { text: 2, image: 0 }
  },
  forgotten_hero: {
    number: 21,
    family: 'ai_scene',
    weight: 'V',
    interactive: false,
    trigger: 'pool',
    needs: ['browser', 'ai_image', 'ai_text', 'stratz'],
    allowDegrade: [],
    restDays: 30,
    slot: 'any',
    silentAfterPatchDays: 7,
    heroGate: 'cross72h',
    sameDay: [...others(STATS, 'forgotten_hero'), ...others(SCENES, 'forgotten_hero')],
    browserCalls: 1,
    aiCalls: { text: 1, image: 1 }
  },
  horoscope: {
    number: 22,
    family: 'ai_scene',
    weight: 'V',
    interactive: false,
    trigger: 'anchor',
    needs: ['browser', 'ai_image'],
    allowDegrade: [],
    restDays: 14,
    slot: { exactMsk: '08:00' },
    bank: { name: 'horoscope', exhaust: 'new_round' },
    heroGate: 'cross72h',
    sameDay: [...others(SCENES, 'horoscope'), 'shame_of_day'],
    browserCalls: 1,
    aiCalls: { text: 0, image: 1 }
  },
  hero_trial: {
    number: 23,
    family: 'ai_scene',
    weight: 'V',
    interactive: true,
    trigger: 'pool',
    needs: ['browser', 'ai_image'],
    allowDegrade: [],
    restDays: 21,
    slot: 'evening',
    bank: { name: 'hero_trial', exhaust: 'new_round' },
    poll: { kind: 'regular', closeAfterHours: 24, inPicture: false },
    heroGate: 'cross72h',
    sameDay: others(SCENES, 'hero_trial'),
    browserCalls: 1,
    aiCalls: { text: 0, image: 1 }
  },
  would_you_rather: {
    number: 24,
    family: 'joke_poll',
    weight: 'L',
    interactive: true,
    trigger: 'pool',
    needs: [],
    allowDegrade: [],
    restDays: 14,
    slot: 'any',
    bank: { name: 'would_you_rather', exhaust: 'new_round' },
    poll: { kind: 'regular', closeAfterHours: 24, inPicture: false },
    heroGate: 'none',
    sameDay: ['ability_in_life'],
    sameWeek: ['confess'],
    browserCalls: 0,
    aiCalls: { text: 0, image: 0 }
  },
  on_lane: {
    number: 25,
    family: 'guess',
    weight: 'L',
    interactive: true,
    trigger: 'pool',
    needs: [],
    allowDegrade: [],
    restDays: 14,
    slot: 'any',
    bank: { name: 'on_lane', exhaust: 'pause' },
    poll: { kind: 'quiz', closeAfterHours: 168, inPicture: false },
    heroGate: 'none',
    sameDay: ['whose_ability', 'rebus'],
    browserCalls: 0,
    aiCalls: { text: 0, image: 0 }
  },
  rebus: {
    number: 26,
    family: 'guess',
    weight: 'V',
    interactive: true,
    trigger: 'pool',
    needs: ['browser'],
    allowDegrade: [],
    restDays: 30,
    slot: 'weekend',
    bank: { name: 'rebus', exhaust: 'pause' },
    poll: { kind: 'quiz', closeAfterHours: 168, inPicture: true },
    heroGate: 'none',
    sameDay: ['whose_ability', 'on_lane'],
    browserCalls: 1,
    aiCalls: { text: 0, image: 0 }
  },
  toxic_bingo: {
    number: 27,
    family: 'picture_bank',
    weight: 'V',
    interactive: false,
    trigger: 'pool',
    needs: ['browser'],
    allowDegrade: [],
    restDays: 21,
    slot: 'fri_sat_evening',
    bank: { name: 'toxic_bingo', exhaust: 'new_round' },
    heroGate: 'none',
    sameDay: ['toxic_translator', 'tier_list'],
    browserCalls: 1,
    aiCalls: { text: 0, image: 0 }
  },
  fake_item: {
    number: 28,
    family: 'picture_bank',
    weight: 'V',
    interactive: false,
    trigger: 'pool',
    needs: ['browser'],
    allowDegrade: [],
    restDays: 21,
    slot: 'any',
    bank: { name: 'fake_item', exhaust: 'new_round' },
    heroGate: 'none',
    sameDay: ['item_leaflet'],
    browserCalls: 1,
    aiCalls: { text: 0, image: 0 }
  },
  shame_of_day: {
    number: 29,
    family: 'stats',
    weight: 'V',
    interactive: false,
    trigger: 'pool',
    needs: ['browser', 'stats_db'],
    allowDegrade: [],
    restDays: 7,
    slot: { exactMsk: '08:00' },
    heroGate: 'cross72h',
    sameDay: [...others(STATS, 'shame_of_day'), 'horoscope'],
    browserCalls: 1,
    aiCalls: { text: 0, image: 0 }
  },
  quote_of_day: {
    number: 30,
    family: 'text_bank',
    weight: 'L',
    interactive: false,
    trigger: 'pool',
    needs: [],
    allowDegrade: [],
    restDays: 7,
    slot: 'any',
    bank: { name: 'quote_of_day', exhaust: 'new_round' },
    heroGate: 'none',
    sameDay: ['confess', 'explain_dumb'],
    browserCalls: 0,
    aiCalls: { text: 0, image: 0 }
  }
};
