// The rubric scheduler's actor in publishing and the audit log (area-backend-core §1): distinct from the automatic
// news publishing, so its daily limit and the owner's history keep them apart. No HTTP route can set it.
export const RUBRIC_ACTOR = 'rubric-scheduler';
