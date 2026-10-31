import { RUBRIC_META } from '../../modules/rubrics';

/** The rubrics the learning may re-pace: the pool, never the events, chains or anchors. */
export const POOL_RUBRICS: ReadonlySet<string> = new Set(
  Object.entries(RUBRIC_META)
    .filter(([, meta]) => meta.trigger === 'pool')
    .map(([key]) => key)
);
