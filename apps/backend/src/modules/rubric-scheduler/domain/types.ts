// The scheduler's own view of the rubrics and the channel (docs/scheduler/area-backend-core.md §5). It never imports the
// rubrics module: app/ maps RUBRIC_META into these descriptors.

export type Need = 'browser' | 'ai_text' | 'ai_image' | 'ai_upscale' | 'stratz' | 'stats_db';
export type Weight = 'V' | 'L';

export type RubricSlot =
  | 'day'
  | 'evening'
  | 'any'
  | 'weekend'
  | 'fri_evening'
  | 'fri_sat_evening'
  | { fromMsk: string; toMsk: string }
  | { exactMsk: string };

export interface RubricDescriptor {
  key: string;
  title: string;
  family: string;
  weight: 'V' | 'L' | 'V_or_L';
  interactive: boolean;
  trigger: 'chain' | 'event' | 'anchor' | 'pool';
  needs: Need[];
  /** Base rest in days; null for chain and event rubrics. */
  restDays: number | null;
  slot: RubricSlot;
  /** Never on the same Moscow day / week as these; at least `days` from these. */
  sameDay: string[];
  sameWeek: string[];
  apart: { key: string; days: number }[];
  /** Quiet this many days after a patch with hero changes. */
  silentAfterPatchDays: number | null;
  hasPicture: boolean;
  hasPoll: boolean;
}

/** A post in the channel, ours or the news, at its (planned) time. */
export interface ChannelPost {
  at: number;
  weight: Weight;
  /** Null for a news post. */
  rubric: string | null;
  interactive: boolean;
  family: string | null;
}

export type Violation =
  | 'WINDOW'
  | 'DAY_POSTS'
  | 'DAY_RUBRICS'
  | 'GAP'
  | 'INTERACTIVE_DAY'
  | 'INTERACTIVE_WEEK'
  | 'INTERACTIVE_GAP'
  | 'FAMILY_DAY'
  | 'SAME_DAY'
  | 'SAME_WEEK'
  | 'APART'
  | 'ALTERNATION'
  | 'HEAVY_DAY';

export interface ForecastSlot {
  rubric: string;
  at: number;
  reason: { kind: 'rest' | 'anchor'; text: string };
  /** Fallback rubrics for the same slot, best first (at most two). */
  alternates: string[];
  hasPicture: boolean;
  hasPoll: boolean;
}
