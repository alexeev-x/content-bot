import { authorKey, handleAudienceUpdate, wantsAudienceUpdate } from '../../modules/audience';
import type { Container } from '../container';

// The webhook's audience branch (rubric scheduler stage 2): reaction counts, poll votes and discussion-group comments
// go to the audience module; nothing else does. Built per update from the container and the Worker secret.

export interface AudienceBranch {
  wants(update: unknown): boolean;
  handle(update: unknown): Promise<void>;
}

export function createAudienceBranch(
  container: Container,
  input: { ownerId: number; hashKey: string | undefined }
): AudienceBranch {
  const secret = input.hashKey ?? '';
  return {
    wants: wantsAudienceUpdate,
    handle: (update) =>
      handleAudienceUpdate(
        {
          repo: container.audience,
          logger: container.logger,
          now: container.clock.now(),
          ownerId: input.ownerId,
          authorKey: secret === '' ? null : (userId) => authorKey(secret, userId)
        },
        update
      )
  };
}
