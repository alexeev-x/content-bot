import { pictureHeading, type RubricNote, type RubricSample, withBackground } from '../../modules/rubrics';
import { AppError } from '../../shared/app-error';
import type { BuildAi, Scene } from './types';

// The model's scene under a rubric's picture: the hero, the fortune-teller or the title's backdrop.

const SCENE_LABELS = { anketa: 'анкета', forgotten: 'забытый', suspect: 'подозреваемый' } as const;
const RENDER_MAX_BYTES = 8 * 1024 * 1024;
const RENDER_TIMEOUT_MS = 15_000;

const sceneWhy = (scene: Scene & { kind: 'failed' }) =>
  scene.detail === undefined ? scene.reason : `${scene.reason} — ${scene.detail}`;

/** Valve's hero render for the image model; null when it can't be read. */
async function fetchRender(url: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(RENDER_TIMEOUT_MS) });
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.length > 0 && bytes.length <= RENDER_MAX_BYTES ? bytes : null;
  } catch {
    return null;
  }
}

/**
 * A hero's image for the image model: Valve's big render, or — when a hero has none under that name (DEV, 28.10.2026:
 * «Гадалка не нарисована (нет рендера)») — Valve's portrait of the same hero, which the model reads just as well.
 */
async function fetchHeroImage(renderUrl: string): Promise<Uint8Array | null> {
  return (
    (await fetchRender(renderUrl)) ??
    (await fetchRender(renderUrl.replace('/videos/dota_react/heroes/renders/', '/images/dota_react/heroes/')))
  );
}

/** A rubric whose post IS its drawn scene does not go out without it (owner, 28.10.2026): the build fails, in detail. */
function sceneFailed(what: string, why: string): never {
  throw new AppError('UNAVAILABLE', `No picture: ${what}`, { reason: `PICTURE: ${what} — ${why}` });
}

const withScene = (html: string, base64: string) =>
  html.replace('</head>', `<style>:root{--scene:url(data:image/jpeg;base64,${base64})}</style></head>`);

/**
 * The page's HTML with its scene drawn in; null when the title scene was not drawn (the post goes without a picture,
 * and a note says so). A rubric with a layout of its own is drawn by code alone on the flat style (owner, 26.10.2026);
 * only a rubric with no layout gets the model's scene under its title.
 */
export async function pageWithScene(
  ai: BuildAi | null,
  sample: RubricSample,
  page: { html: string },
  notes: RubricNote[]
): Promise<string | null> {
  // «Анкета»: the model puts the hero into the scene; without it the board alone would float on nothing.
  if (sample.fortuneScene !== undefined) {
    const { teller, ball } = sample.fortuneScene;
    const tellerBytes = ai === null ? null : await fetchHeroImage(teller.renderUrl);
    const ballBytes = ai === null || tellerBytes === null ? null : await fetchHeroImage(ball.renderUrl);
    const scene =
      tellerBytes === null || ballBytes === null || ai === null
        ? null
        : await ai.fortuneScene({
            teller: tellerBytes,
            tellerName: teller.heroName,
            ball: ballBytes,
            ballName: ball.heroName
          });
    if (scene?.kind === 'drawn' && /^[A-Za-z0-9+/=]+$/.test(scene.base64)) return withScene(page.html, scene.base64);
    sceneFailed(
      `гадалка ${teller.heroName}, в шаре ${ball.heroName}`,
      tellerBytes === null
        ? `нет изображения героя ${teller.heroName}`
        : ballBytes === null
          ? `нет изображения героя ${ball.heroName}`
          : scene?.kind === 'failed'
            ? sceneWhy(scene)
            : 'ИИ не подключён'
    );
  }
  if (sample.heroScene !== undefined) {
    const render = ai === null ? null : await fetchHeroImage(sample.heroScene.renderUrl);
    const scene =
      render === null || ai === null
        ? null
        : await ai.heroScene({
            hero: render,
            heroName: sample.heroScene.heroName,
            ...(sample.heroScene.scene === undefined ? {} : { scene: sample.heroScene.scene })
          });
    if (scene?.kind === 'drawn' && /^[A-Za-z0-9+/=]+$/.test(scene.base64)) return withScene(page.html, scene.base64);
    sceneFailed(
      `${SCENE_LABELS[sample.heroScene.scene ?? 'anketa']} ${sample.heroScene.heroName}`,
      render === null
        ? `нет изображения героя ${sample.heroScene.heroName}`
        : scene?.kind === 'failed'
          ? sceneWhy(scene)
          : 'ИИ не подключён'
    );
  }
  if (sample.picture === null && ai !== null) {
    const scene = await ai.scene({ heading: pictureHeading(page.html) });
    if (scene.kind === 'drawn') return withBackground(page.html, scene.base64);
    notes.push({ code: 'SCENE_NOT_DRAWN', text: `Сцена не нарисована (${sceneWhy(scene)}): пост без картинки.` });
    return null;
  }
  return page.html;
}
