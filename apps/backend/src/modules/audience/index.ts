export { handleAudienceUpdate, type IngestDeps, THREAD_COMMENTS_MAX, wantsAudienceUpdate } from './application/ingest';
export { checkAudienceSetup, type SetupCheckDeps } from './application/setup-check';
export { type AudienceState, type AudienceStatus, readAudienceStatus, setupState } from './application/health';
export { COMMENTS_KEPT_MS, purgeAudience } from './application/retention';
export type {
  AudienceChat,
  AudienceRepository,
  AudienceTargets,
  AudienceTelegram,
  CommentRow
} from './application/ports';
export { createD1AudienceRepository } from './infrastructure/d1-audience-repository';
export { authorKey } from './infrastructure/author-key';
export { sanitizeComment } from './domain/sanitize';
