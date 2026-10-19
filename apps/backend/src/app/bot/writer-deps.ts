import type { WriterDeps } from '../../modules/ai';
import { getOwnerOperationsSettings } from '../../modules/settings';
import type { Container } from '../container';

/** The AI writer's dependencies, for the webhook and the AI_JOBS consumer alike (they read the owner's time zone). */
export async function createWriterDeps(container: Container, requestId: string): Promise<WriterDeps> {
  return {
    repo: container.aiRepository,
    writer: container.aiWriter,
    profiles: container.aiProfiles,
    ownerPosts: container.aiOwnerPosts,
    clock: container.clock,
    newId: container.newId,
    provider: container.aiProvider,
    rules: container.aiRules,
    timezone: (await getOwnerOperationsSettings({ repo: container.settings, logger: container.logger, requestId }))
      .timezone
  };
}
