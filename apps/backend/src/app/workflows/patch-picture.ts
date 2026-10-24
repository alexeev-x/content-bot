import { drawHotfixPicture, drawPatchPicture, type PatchPictureResult } from '../../modules/ai';
import { type DotaDraftSource, isHotfixTitle, patchPicturePoints, patchVersionOf } from '../../modules/dota';
import { getOwnerOperationsSettings } from '../../modules/settings';
import type { Container } from '../container';

// Which picture a patch announcement gets (owner, 22.10.2026): a versioned patch its number and the main points of
// Valve's notes of that version; a «Dota 2 Update» its own cover after the owner's three references (owner,
// 24.10.2026: «чтобы они не были похожи»). An announcement that is no patch, or a patch whose notes or version cannot
// be read, keeps the announcement's images.

/** How many newest announcements tell the hotfix's scene what is current in the game. */
const RECENT_TITLES = 8;

export function patchPictureFor(container: Container, requestId: string, onError: (error: unknown) => void) {
  return async (source: DotaDraftSource): Promise<{ bytes: Uint8Array; contentType: string } | 'failed' | null> => {
    const version = patchVersionOf(source.title);
    const hotfix = isHotfixTitle(source.title);
    if (version === null && !hotfix) return null;
    const { timezone } = await getOwnerOperationsSettings({
      repo: container.settings,
      logger: container.logger,
      requestId
    });
    const deps = {
      repo: container.aiRepository,
      clock: container.clock,
      timezone,
      newId: container.newId,
      provider: container.aiProvider,
      images: container.aiImageProvider,
      onError
    };
    let result: PatchPictureResult;
    if (version !== null) {
      let number: string;
      let points: readonly string[];
      let about: string;
      try {
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
      } catch (error) {
        // Valve's feed failing is no reason to lose the announcement's images, as the writer falls back to its text.
        onError(error);
        return null;
      }
      if (points.length === 0) return null;
      result = await drawPatchPicture(deps, {
        number,
        points,
        about,
        // Never the colour of the last cover (owner, 23.10.2026); a failed read only allows a repeat.
        lastTheme: await container.systemState.readCoverTheme().catch(() => null)
      });
      if (result.kind === 'drawn' && result.theme !== null)
        await container.systemState.rememberCoverTheme(result.theme, container.clock.now()).catch(onError);
    } else {
      // The newest announcements say what the game is about now (an event, its place); without them the scene is
      // chosen from the hotfix alone.
      const recent = await container.sourceEvents
        .list({ page: 1, limit: RECENT_TITLES })
        .then((page) => page.items.map((item) => item.title).filter((title) => !isHotfixTitle(title)))
        .catch((error: unknown) => {
          onError(error);
          return [];
        });
      result = await drawHotfixPicture(deps, {
        about: [source.title, source.excerpt ?? ''].join('\n'),
        recent
      });
    }
    container.logger.info({
      component: 'source_media',
      operation: 'patch_picture',
      requestId,
      status: result.kind === 'drawn' ? 'drawn' : result.reason
    });
    return result.kind === 'drawn' ? { bytes: result.bytes, contentType: result.contentType } : 'failed';
  };
}
