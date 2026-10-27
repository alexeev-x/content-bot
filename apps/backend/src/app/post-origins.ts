import type { PostOriginDto } from '@alexeev/contracts';
import { readPostOrigins } from '../modules/ai';
import type { Container } from './container';
import { AUTOPUBLISH_ACTOR } from './workflows/autopublish-source-event';

/**
 * The studio-only origin of each post (at most 100): an approved AI draft, or a post the automatic publishing made
 * and sent with no one approving it (owner, 27.10.2026: a quiet build's joke had no «ИИ» mark). The latter wins: the
 * owner never approved it, even when a draft stands behind it.
 */
export async function readStudioOrigins(
  container: Pick<Container, 'aiWriter' | 'posts'>,
  postIds: readonly string[]
): Promise<Map<string, PostOriginDto>> {
  const [origins, automatic] = await Promise.all([
    readPostOrigins({ writer: container.aiWriter }, postIds),
    container.posts.createdBy(AUTOPUBLISH_ACTOR, postIds)
  ]);
  for (const id of automatic) origins.set(id, { kind: 'ai', source: 'auto', editRatio: null });
  return origins;
}
