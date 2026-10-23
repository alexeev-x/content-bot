import { drawPatchPicture } from '../../modules/ai';
import {
  type DotaDraftSource,
  HOTFIX_PICTURE_POINTS,
  isHotfixTitle,
  patchPicturePoints,
  patchVersionOf
} from '../../modules/dota';
import { getOwnerOperationsSettings } from '../../modules/settings';
import type { Container } from '../container';

// Which number and points a patch announcement's picture shows (owner, 22.10.2026): a versioned patch from Valve's
// notes of that version, a «Dota 2 Update» hotfix the current version with «Исправления ошибок». An announcement that
// is no patch, or a patch whose notes or version cannot be read, keeps the announcement's images.

export function patchPictureFor(container: Container, requestId: string, onError: (error: unknown) => void) {
  return async (source: DotaDraftSource): Promise<{ bytes: Uint8Array; contentType: string } | 'failed' | null> => {
    const version = patchVersionOf(source.title);
    const hotfix = isHotfixTitle(source.title);
    if (version === null && !hotfix) return null;
    let number: string | null;
    let points: readonly string[];
    try {
      if (version !== null) {
        const digest = (await container.dotaWatcher.digestPatch?.(version)) ?? null;
        if (digest === null) return null;
        number = version;
        points = patchPicturePoints(digest);
      } else {
        number = (await container.dotaWatcher.latestPatchVersion?.()) ?? null;
        points = HOTFIX_PICTURE_POINTS;
      }
    } catch (error) {
      // Valve's feed failing is no reason to lose the announcement's images, as the writer falls back to its text.
      onError(error);
      return null;
    }
    if (number === null || points.length === 0) return null;
    const { timezone } = await getOwnerOperationsSettings({
      repo: container.settings,
      logger: container.logger,
      requestId
    });
    const result = await drawPatchPicture(
      {
        repo: container.aiRepository,
        clock: container.clock,
        timezone,
        newId: container.newId,
        provider: container.aiProvider,
        images: container.aiImageProvider,
        onError
      },
      { number, points }
    );
    container.logger.info({
      component: 'source_media',
      operation: 'patch_picture',
      requestId,
      status: result.kind === 'drawn' ? 'drawn' : result.reason
    });
    return result.kind === 'drawn' ? { bytes: result.bytes, contentType: result.contentType } : 'failed';
  };
}
