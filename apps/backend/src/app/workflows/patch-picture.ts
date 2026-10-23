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
// notes of that version, a «Dota 2 Update» the word «ОБНОВЛЕНИЕ» with «Исправления ошибок» (owner, 23.10.2026). An announcement that
// is no patch, or a patch whose notes or version cannot be read, keeps the announcement's images.

/** The word a hotfix's cover shows where a patch shows its version. */
export const HOTFIX_PICTURE_TITLE = 'ОБНОВЛЕНИЕ';

export function patchPictureFor(container: Container, requestId: string, onError: (error: unknown) => void) {
  return async (source: DotaDraftSource): Promise<{ bytes: Uint8Array; contentType: string } | 'failed' | null> => {
    const version = patchVersionOf(source.title);
    const hotfix = isHotfixTitle(source.title);
    if (version === null && !hotfix) return null;
    let number: string | null;
    let points: readonly string[];
    let about: string;
    try {
      if (version !== null) {
        const digest = (await container.dotaWatcher.digestPatch?.(version)) ?? null;
        if (digest === null) return null;
        number = version;
        points = patchPicturePoints(digest);
        // What the colour is chosen by: Valve's general notes and the most changed heroes and items.
        about = [
          ...digest.general.flatMap((group) => group.notes).slice(0, 15),
          `Больше всего изменений: ${[...digest.heroes, ...digest.items]
            .sort((a, b) => b.notes.length - a.notes.length)
            .slice(0, 8)
            .map((entity) => entity.name)
            .join(', ')}`
        ].join('; ');
      } else {
        // A hotfix says so instead of a version (owner, 23.10.2026: a version's cover on a hotfix about an event misled).
        number = HOTFIX_PICTURE_TITLE;
        points = HOTFIX_PICTURE_POINTS;
        about = `Хотфикс: ${source.title}`;
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
      // Never the colour of the last cover (owner, 23.10.2026); a failed read only allows a repeat.
      { number, points, about, lastTheme: await container.systemState.readCoverTheme().catch(() => null) }
    );
    if (result.kind === 'drawn')
      await container.systemState.rememberCoverTheme(result.theme, container.clock.now()).catch(onError);
    container.logger.info({
      component: 'source_media',
      operation: 'patch_picture',
      requestId,
      status: result.kind === 'drawn' ? 'drawn' : result.reason
    });
    return result.kind === 'drawn' ? { bytes: result.bytes, contentType: result.contentType } : 'failed';
  };
}
