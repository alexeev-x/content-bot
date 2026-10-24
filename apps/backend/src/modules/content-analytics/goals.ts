import { CONTENT_GOAL_PACE_DAYS, type ContentGoalDto } from '@alexeev/contracts';
import type { Clock } from '../../platform/clock';
import { CONTENT_PLATFORMS, type ContentPlatform } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
/** A pace from fewer days than this is mostly noise. */
const MIN_PACE_DAYS = 7;
/** A forecast further out than this says nothing useful. */
const MAX_FORECAST_DAYS = 5 * 365;

export interface GoalRow {
  platform: ContentPlatform;
  target: number;
  setAt: number;
}

export interface FollowersRow {
  platform: ContentPlatform;
  day: string;
  followers: number;
}

export interface ContentGoalRepository {
  /** The goals and the daily follower counts since `fromDay`. */
  read(fromDay: string): Promise<{ goals: GoalRow[]; followers: FollowersRow[] }>;
  set(input: { platform: ContentPlatform; target: number; now: number }): Promise<void>;
  remove(platform: ContentPlatform): Promise<void>;
}

function dayKey(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

/** One goal with its pace: followers gained per week between the first and the last stored day. */
export function goalProgress(goal: GoalRow, followers: readonly FollowersRow[], now: number): ContentGoalDto {
  const own = followers.filter((row) => row.platform === goal.platform);
  const first = own[0];
  const last = own.at(-1);
  const current = last?.followers ?? null;
  const reached = current !== null && current >= goal.target;
  let perWeek: number | null = null;
  if (first !== undefined && last !== undefined) {
    const days = (Date.parse(last.day) - Date.parse(first.day)) / DAY_MS;
    if (days >= MIN_PACE_DAYS) perWeek = Math.round(((last.followers - first.followers) / days) * 7 * 10) / 10;
  }
  let forecastDay: string | null = null;
  if (!reached && current !== null && perWeek !== null && perWeek > 0) {
    const days = Math.ceil((goal.target - current) / (perWeek / 7));
    if (days <= MAX_FORECAST_DAYS) forecastDay = dayKey(now + days * DAY_MS);
  }
  return {
    platform: goal.platform,
    target: goal.target,
    followers: current,
    perWeek,
    forecastDay,
    reached,
    setAt: new Date(goal.setAt).toISOString()
  };
}

export async function readContentGoals(deps: {
  repo: ContentGoalRepository;
  clock: Clock;
}): Promise<{ goals: ContentGoalDto[] }> {
  const now = deps.clock.now();
  const { goals, followers } = await deps.repo.read(dayKey(now - CONTENT_GOAL_PACE_DAYS * DAY_MS));
  const order = (platform: ContentPlatform) => CONTENT_PLATFORMS.indexOf(platform);
  return {
    goals: [...goals]
      .sort((a, b) => order(a.platform) - order(b.platform))
      .map((goal) => goalProgress(goal, followers, now))
  };
}

export async function setContentGoal(
  deps: { repo: ContentGoalRepository; clock: Clock },
  input: { platform: ContentPlatform; target: number }
): Promise<{ goals: ContentGoalDto[] }> {
  await deps.repo.set({ ...input, now: deps.clock.now() });
  return readContentGoals(deps);
}

export async function removeContentGoal(
  deps: { repo: ContentGoalRepository; clock: Clock },
  platform: ContentPlatform
): Promise<{ goals: ContentGoalDto[] }> {
  await deps.repo.remove(platform);
  return readContentGoals(deps);
}
