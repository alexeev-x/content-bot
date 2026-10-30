import { edgeTextCache, STRATZ_CACHE_SECONDS } from '../../platform/edge-cache';
import { expandRichMedia, RICH_MEDIA_SLOT, richMediaId } from '@alexeev/contracts';
import { InputFile } from 'grammy';
import { type PictureRenderer } from '../../integrations/browser-render/browser-render';
import { createDotaConstantsApi, DotaConstantsError } from '../../integrations/dotaconstants/dotaconstants';
import { createSteamPublicApi, SteamPublicError } from '../../integrations/steam-public/steam-public';
import { createOpenDotaApi, OpenDotaError } from '../../integrations/opendota/opendota-api';
import { createStratzApi, StratzError } from '../../integrations/stratz/stratz-api';
import { createTelegramApi, type TelegramSendApi } from '../../integrations/telegram/telegram-api';
import { createValveDatafeedApi, DatafeedError } from '../../integrations/valve-datafeed/valve-datafeed';
import {
  drawAnketaScene,
  drawForgottenScene,
  drawHoroscopeScene,
  drawRubricScene,
  drawSuspectScene,
  writeRubricCaption
} from '../../modules/ai';
import { condenseBuild, isRelevantPath, parseBuildMessage, splitDiff, type GameFind } from '../../modules/game-files';
import {
  buildRubricSample,
  pictureHeading,
  RUBRIC_BRIEFS,
  RUBRIC_TITLES,
  titlePicture,
  rubricRichHtml,
  type RubricKey,
  type HeroMatchSource,
  type RubricSources,
  withBackground
} from '../../modules/rubrics';
import { describeError, errorParts } from '../../platform/error-detail';
import type { Logger } from '../../platform/logging/logger';
import { getOwnerOperationsSettings } from '../../modules/settings';
import { AppError } from '../../shared/app-error';
import type { Container } from '../container';
import { pictureImproverFor, type SourcePicture } from '../workflows/picture-quality';

// DEV only (owner, 25.10.2026): one rubric's post from live data — the picture rendered by the browser from Valve's
// icons, the caption, the poll — goes to the owner's chat with the bot, the way subscribers would see it.

const TELEGRAM_TIMEOUT_MS = 20_000;
const FLAGS = { disable_notification: false, protect_content: false } as const;
const BARE_FINDS_MAX = 4;
const SCENE_LABELS = { anketa: 'анкета', forgotten: 'забытый', suspect: 'подозреваемый' } as const;
const BARE_TEXT_MAX = 1500;
const GITHUB_TIMEOUT_MS = 8000;
const STRATZ_GAP_MS = 1500;
/** A rubric's source photo is shown across the post: narrower than this, it goes through the picture law. */
const RUBRIC_PHOTO_MIN_WIDTH = 1200;
const PHOTO_TIMEOUT_MS = 15_000;
const PHOTO_MAX_BYTES = 8_000_000;
/** Steam's announcement images and Workshop screenshots only (the rubrics build these addresses themselves). */
const PHOTO_ORIGINS = [
  'https://clan.akamai.steamstatic.com/',
  'https://images.steamusercontent.com/',
  'https://i.imgur.com/'
];

/**
 * Links as words at the end of a caption (owner, 27.10.2026: «ссылки прятать в текст»): each one's words on its own line
 * and a text_link entity over them; UTF-16 offsets, as Telegram counts.
 */
function withLinks(
  body: string,
  links: { text: string; url: string }[]
): { text: string; entities: { type: 'text_link'; offset: number; length: number; url: string }[] } {
  let text = body;
  const entities: { type: 'text_link'; offset: number; length: number; url: string }[] = [];
  for (const link of links) {
    text += text === '' ? '' : '\n';
    entities.push({ type: 'text_link', offset: text.length, length: link.text.length, url: link.url });
    text += link.text;
  }
  return { text, entities };
}

const RENDER_MAX_BYTES = 8 * 1024 * 1024;
const RENDER_TIMEOUT_MS = 15_000;

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

/** A rubric whose post IS its drawn scene does not go out without it (owner, 28.10.2026): the sample fails, in detail. */
function sceneFailed(what: string, why: string): never {
  throw new AppError('UNAVAILABLE', `No picture: ${what}`, { reason: `PICTURE: ${what} — ${why}` });
}

/** The carousel's order: stills first, then GIFs, then clips. */
const ALBUM_ORDER = { photo: 0, animation: 1, video: 2 } as const;

const escapeRich = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/** An album's rich HTML: the media as a carousel (one alone as a figure), each line of the text as a paragraph, the links. */
function albumRichHtml(
  body: string,
  links: { text: string; url: string }[],
  media: readonly { kind: 'photo' | 'video' | 'animation' }[]
): string {
  return [
    expandRichMedia(RICH_MEDIA_SLOT, media),
    ...body
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => `<p>${escapeRich(line.trim())}</p>`),
    ...links.map((link) => `<p><a href="${escapeRich(link.url)}">${escapeRich(link.text)}</a></p>`)
  ].join('\n');
}

async function fetchPhoto(url: string): Promise<Uint8Array> {
  const failed = () => new AppError('UNAVAILABLE', 'The source picture was not fetched', { reason: 'PHOTO_FETCH' });
  if (!PHOTO_ORIGINS.some((origin) => url.startsWith(origin))) throw failed();
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS) });
  } catch {
    throw failed();
  }
  const length = Number(response.headers.get('content-length') ?? 0);
  if (!response.ok || length > PHOTO_MAX_BYTES) {
    await response.body?.cancel();
    throw failed();
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > PHOTO_MAX_BYTES) throw failed();
  return bytes;
}

// Finds from before the check's note and the post link were kept (migration 0114) have no text: the writer gets the
// build's own changed lines instead, read the way the game-files flow reads them. A failed read leaves the find as it was.
/**
 * DEV samples only: the week's builds straight from the tracker when the watch kept no find (DEV runs with the background
 * work off; production has it on, and this sample page goes once every rubric is approved),
 * owner 26.10.2026: «собрать данные за неделю назад»: only builds touching heroes, abilities, items or the strings.
 */
async function trackerFinds(container: Container, since: number): Promise<GameFind[]> {
  const github = container.gameFilesRepo;
  if (github === null) return [];
  try {
    const commits = await github.listCommits(30, AbortSignal.timeout(GITHUB_TIMEOUT_MS));
    return commits
      .filter((commit) => commit.committedAt >= since)
      .flatMap((commit) => {
        const header = parseBuildMessage(commit.message);
        return header !== null && header.paths.some(isRelevantPath)
          ? [{ sha: commit.sha, build: header.build, committedAt: commit.committedAt, note: null, text: null }]
          : [];
      })
      .slice(0, BARE_FINDS_MAX);
  } catch {
    return [];
  }
}

async function fillBareFinds(container: Container, finds: GameFind[]): Promise<GameFind[]> {
  const github = container.gameFilesRepo;
  if (github === null) return finds;
  const bare = finds.filter((find) => find.text === null && find.note === null).slice(0, BARE_FINDS_MAX);
  const filled = new Map<string, string>();
  await Promise.all(
    bare.map(async (find) => {
      try {
        const whole = await github.getCommitDiff(find.sha, AbortSignal.timeout(GITHUB_TIMEOUT_MS));
        const text = condenseBuild(splitDiff(whole));
        if (text !== null) filled.set(find.sha, text.slice(0, BARE_TEXT_MAX));
      } catch {
        // The find stays without text.
      }
    })
  );
  return finds.map((find) => ({ ...find, text: filled.get(find.sha) ?? find.text }));
}

/** The guide's window and band in the statistics base (owner, 29.10.2026): 14 days of Immortal games. */
const GUIDE_DAYS_MS = 14 * 86_400_000;
const GUIDE_BAND = 'immortal';
const GUIDE_GAMES_MAX = 20_000;

/**
 * The statistics base as the guide reads it (`modules/hero-stats`): one hero at one position over the last 14 days,
 * without the followed players' own rows (they win more than their lobby, so their games would flatter the hero).
 * Null where the base is not bound (DEV never runs it): the guide then keeps STRATZ's sample.
 */
function heroMatchSource(container: Container): HeroMatchSource | null {
  const repo = container.heroStats;
  if (repo === null) return null;
  const fair = async (heroId: number, position: number, limit: number) =>
    (await repo.rows(heroId, position, container.clock.now() - GUIDE_DAYS_MS, GUIDE_BAND, limit)).filter(
      (row) => !row.tracked
    );
  return {
    async games(heroId, position) {
      return (await fair(heroId, position, GUIDE_GAMES_MAX)).map((row) => ({
        won: row.won,
        minutes: row.minutes,
        enemies: row.enemies
          .split(',')
          .map((slot) => Number(slot.split(':')[0]))
          .filter((hero) => Number.isInteger(hero) && hero > 0)
      }));
    },
    async sample(heroId, position, limit) {
      return (await fair(heroId, position, limit * 2)).slice(0, limit).map((row) => ({
        victory: row.won,
        startedAt: Math.floor(row.startedAt / 1000),
        patch: row.patch,
        minutes: row.minutes,
        items: row.detail.i,
        neutral: row.detail.n,
        purchases: row.detail.p.map(([itemId, minute]) => ({ itemId, minute })),
        // The base keeps the order the points were spent in: level n is the n-th point.
        abilities: row.detail.s.map((abilityId, index) => ({ abilityId, time: index, level: index + 1 }))
      }));
    }
  };
}

function rubricSources(
  gameFinds: (since: number) => Promise<GameFind[]>,
  stratzAccess: { token: string; bridgeUrl?: string } | null
): RubricSources {
  const stratz =
    stratzAccess === null
      ? null
      : createStratzApi({ ...stratzAccess, cache: edgeTextCache('stratz', STRATZ_CACHE_SECONDS) });
  // One STRATZ request at a time with a pause between (owner, 27.10.2026: «не надо спешить… делай по 1 запросу»):
  // eight at once came back STRATZ_BLOCKED. The chain lives for this one sample only.
  let turn: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(call: () => Promise<T>): Promise<T> => {
    const run = turn.then(call);
    const pause = () => new Promise((resolve) => setTimeout(resolve, STRATZ_GAP_MS));
    turn = run.then(pause, pause);
    return run;
  };
  const openDota = stratzAccess === null ? null : createOpenDotaApi({ bridgeUrl: stratzAccess.bridgeUrl });
  const constants = createDotaConstantsApi();
  const datafeed = createValveDatafeedApi();
  const steam = createSteamPublicApi();
  return {
    heroes: () => constants.heroes(),
    items: () => constants.items(),
    async itemValues(itemKey) {
      const item = (await datafeed.itemList()).find((each) => each.name === itemKey);
      return item === undefined ? null : datafeed.itemValues(item.id);
    },
    async heroDetail(heroId) {
      const hero = await datafeed.hero(heroId);
      return {
        id: hero.id,
        name: hero.name,
        localizedName: hero.nameLoc,
        abilities: hero.abilities.map((ability) => ({
          id: ability.id,
          key: ability.name,
          name: ability.nameLoc,
          isUltimate: ability.type === 1,
          cooldowns: ability.cooldowns,
          manaCosts: ability.manaCosts,
          values: ability.values.map((value) => ({ name: value.name, heading: value.heading, values: value.values }))
        })),
        talents: hero.talents.map((talent) => ({
          id: talent.id,
          key: talent.name,
          name: talent.nameLoc,
          // What the hero's abilities say this talent adds, by the value's name.
          bonuses: hero.abilities.flatMap((ability) =>
            ability.values.flatMap((value) =>
              value.bonuses
                .filter((bonus) => bonus.talent === talent.name)
                .map((bonus) => ({ name: value.name, value: bonus.value }))
            )
          )
        }))
      };
    },
    patches: () => datafeed.patchList(),
    async patchNotes(version) {
      const notes = await datafeed.patchNotes(version);
      return { version: notes.version, timestamp: notes.timestamp, heroes: notes.heroes };
    },
    talentLevels: (heroName) => constants.talentLevels(heroName),
    steamNews: () => steam.dotaNews(),
    workshopTrendingIds: () => steam.workshopTrendingIds(),
    workshopItem: (id) => steam.workshopItem(id),
    gameFinds,
    fallback:
      openDota === null
        ? null
        : {
            async heroItemPopularity(heroId) {
              const rows = await inTurn(() => openDota.heroItemPopularity(heroId));
              const each = (counts: Record<string, number>) =>
                Object.entries(counts).map(([itemId, matches]) => ({ itemId: Number(itemId), matches }));
              return {
                start: each(rows.start_game_items),
                early: each(rows.early_game_items),
                mid: each(rows.mid_game_items),
                late: each(rows.late_game_items)
              };
            },
            async heroMatchups(heroId) {
              const rows = await inTurn(() => openDota.heroMatchups(heroId));
              return rows.map((row) => ({ heroId: row.hero_id, matches: row.games_played, wins: row.wins }));
            },
            async heroDurations(heroId) {
              const rows = await inTurn(() => openDota.heroDurations(heroId));
              return rows.map((row) => ({ from: row.duration_bin, matches: row.games_played, wins: row.wins }));
            }
          },
    stats:
      stratz === null
        ? null
        : {
            async heroBracketStats(bracket) {
              const rows = await inTurn(() => stratz.heroWeeks(bracket, 1));
              return rows.map((row) => ({ heroId: row.heroId, bracket, matches: row.matches, wins: row.wins }));
            },
            async heroLateItems(heroId) {
              // Items bought from minute 20 on, most bought first.
              const totals = new Map<number, number>();
              for (const row of await inTurn(() => stratz.heroPurchases(heroId))) {
                if (row.minute >= 20) totals.set(row.itemId, (totals.get(row.itemId) ?? 0) + row.matches);
              }
              return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([itemId]) => itemId);
            },
            heroPurchases: (heroId) => inTurn(() => stratz.heroPurchases(heroId)),
            heroPositionDays: (heroId, position, days) => inTurn(() => stratz.heroPositionDays(heroId, position, days)),
            heroStartingItems: (heroId, position) => inTurn(() => stratz.startingItems(heroId, position)),
            heroPositionPurchases: (heroId, position) => inTurn(() => stratz.positionPurchases(heroId, position)),
            heroNeutralItems: (heroId, position) => inTurn(() => stratz.neutralItems(heroId, position)),
            heroTalents: (heroId, position) => inTurn(() => stratz.talents(heroId, position)),
            heroMatchups: (heroId) => inTurn(() => stratz.matchups(heroId)),
            heroGuideSample: (heroId, position, withPurchases) =>
              inTurn(() => stratz.guideSample(heroId, position, withPurchases)),
            positions: () => inTurn(() => stratz.positions()),
            positionWeeks: (bracket, position, weeks) => inTurn(() => stratz.positionWeeks(bracket, position, weeks)),
            lengthRates: (position) => inTurn(() => stratz.lengthRates(position)),
            twoWeeks: (bracket) => inTurn(() => stratz.heroWeeks(bracket, 2))
          }
  };
}

function sourceError(error: unknown): { code: string; status: number | null } | null {
  if (
    error instanceof DotaConstantsError ||
    error instanceof DatafeedError ||
    error instanceof SteamPublicError ||
    error instanceof StratzError ||
    error instanceof OpenDotaError
  ) {
    return { code: error.code, status: error.httpStatus };
  }
  return null;
}

const CAPTION_TIMEOUT_MS = 120_000;
/** The free plan takes one screenshot per 10 seconds. */
const BROWSER_GAP_MS = 11_000;

type Scene = { kind: 'drawn'; base64: string } | { kind: 'failed'; reason: string; detail?: string };

const sceneWhy = (scene: Scene & { kind: 'failed' }) =>
  scene.detail === undefined ? scene.reason : `${scene.reason} — ${scene.detail}`;

/** A local run's copy of a sample (`SAMPLE_MIRROR`, local vars only): read back from the local R2 to check results. */
export type SampleMirror = (name: string, body: Uint8Array | string, contentType: string) => Promise<void>;

export type RubricSampleDeps = {
  /** Local runs only: every sample is also kept in the local R2. */
  mirror?: SampleMirror | null;
  /** The finds in the game's files since a time (the game-files module's read). */
  gameFinds: (since: number) => Promise<GameFind[]>;
  /** STRATZ through the stats bridge; null until both the token and the bridge are set. */
  stratzAccess: { token: string; bridgeUrl?: string } | null;
  /** The bot's own match base «Гайд на героя» counts from. */
  heroMatches: HeroMatchSource | null;
  /** The horoscope's round of fortune-tellers. */
  tellers: { used(): Promise<number[]>; remember(heroIds: number[]): Promise<void> } | null;
  /** A rubric's counter of turns. */
  turns: { next(name: string): Promise<number> } | null;
  renderer: PictureRenderer | null;
  /** The AI writer's caption and the drawn scene with the title; null when the AI is not wired. */
  ai: {
    caption: (input: {
      title: string;
      draft: string;
      poll: string | null;
      brief: string;
      reference?: string;
      signal: AbortSignal;
    }) => Promise<string | null>;
    scene: (input: { heading: { text: string; red: string | null } | null }) => Promise<Scene>;
    /** «Анкета»: the hero placed into the owner's scene. */
    heroScene: (input: {
      hero: Uint8Array;
      heroName: string;
      scene?: 'anketa' | 'forgotten' | 'suspect';
    }) => Promise<Scene>;
    /** «Гороскоп»: the fortune-teller and the ball's head drawn into the owner's scene. */
    fortuneScene: (input: {
      teller: Uint8Array;
      tellerName: string;
      ball: Uint8Array;
      ballName: string;
    }) => Promise<Scene>;
  } | null;
  /** The picture law (workflows/picture-quality.ts): a narrow source picture comes back sharper, else as it was. */
  improvePhoto: (file: SourcePicture) => Promise<SourcePicture>;
  telegram: TelegramSendApi;
  ownerChatId: string;
  random: () => number;
  now: number;
  logger: Logger;
  requestId: string;
};

/**
 * One rubric the way production would post it (owner, 25.10.2026: «как будто продовская, через ИИ»): live data, the AI
 * writer's caption and a picture: the model's scene and title under the browser's exact portraits, icons and numbers.
 * A note tells what failed.
 */
export async function sendRubricSample(deps: RubricSampleDeps, rubric: RubricKey): Promise<void> {
  const startedAt = Date.now();
  const log = (status: string, errorCode?: string) =>
    deps.logger.info({
      component: 'rubric-samples',
      operation: rubric,
      requestId: deps.requestId,
      status,
      ...(errorCode === undefined ? {} : { errorCode }),
      durationMs: Date.now() - startedAt
    });

  let sample;
  try {
    sample = await buildRubricSample(rubric, {
      sources: {
        ...rubricSources(deps.gameFinds, deps.stratzAccess),
        heroMatches: deps.heroMatches,
        tellers: deps.tellers,
        turns: deps.turns
      },
      random: deps.random,
      now: deps.now
    });
  } catch (error) {
    const source = sourceError(error);
    if (source !== null) {
      log('failed', source.code);
      // The source's HTTP status tells a wrong key (401) from a refused address (403); its own words say why.
      throw new AppError('UNAVAILABLE', 'A data source did not answer', {
        reason: describeError(error),
        ...(source.status === null ? {} : { status: String(source.status) })
      });
    }
    if (error instanceof AppError) log('failed', error.details?.['reason'] ?? error.code);
    throw error;
  }

  const title = RUBRIC_TITLES[rubric];
  const poll = sample.poll === null ? null : `${sample.poll.question} — ${sample.poll.options.join(' / ')}`;
  // The caption is written while the scene is drawn.
  // A rubric that is one poll with its picture has no text to write.
  const pollOnly = sample.pictureInPoll === true && sample.poll !== null;
  // Fixed captions (a riddle and its answer) are final as written: no AI either.
  const noWriter = pollOnly || sample.ownText === true;
  const caption =
    deps.ai === null || noWriter
      ? Promise.resolve(null)
      : deps.ai.caption({
          title,
          draft: sample.text,
          poll,
          brief: RUBRIC_BRIEFS[rubric],
          ...(sample.reference === undefined ? {} : { reference: sample.reference }),
          signal: AbortSignal.timeout(CAPTION_TIMEOUT_MS)
        });

  const notes: string[] = [...(sample.notes ?? [])];
  let picture: Uint8Array | null = null;
  // Every rubric gets a picture for now (owner, 25.10.2026: «пусть ИИ рисует для всех, а там уже отбросим»): one with
  // no layout of its own is the drawn scene with its title alone, and none at all when the scene is not drawn.
  // A rubric that decided against a picture (owner, 28.10.2026: text jokes and bare polls) gets no scene either.
  const ownPhotos = sample.photo !== undefined || sample.album !== undefined;
  const page =
    ownPhotos || sample.noPicture === true ? null : (sample.picture ?? (deps.ai === null ? null : titlePicture(title)));
  if (page !== null) {
    if (deps.renderer === null) {
      throw new AppError('UNAVAILABLE', 'Browser Rendering is not bound here', { reason: 'BROWSER_NOT_BOUND' });
    }
    let html: string | null = page.html;
    // A rubric with a layout of its own is drawn by code alone on the flat style (owner, 26.10.2026); only a rubric
    // with no layout gets the model's scene under its title.
    // «Анкета»: the model puts the hero into the scene; without it the board alone would float on nothing.
    if (sample.fortuneScene !== undefined) {
      const { teller, ball } = sample.fortuneScene;
      const tellerBytes = deps.ai === null ? null : await fetchHeroImage(teller.renderUrl);
      const ballBytes = deps.ai === null || tellerBytes === null ? null : await fetchHeroImage(ball.renderUrl);
      const scene =
        tellerBytes === null || ballBytes === null || deps.ai === null
          ? null
          : await deps.ai.fortuneScene({
              teller: tellerBytes,
              tellerName: teller.heroName,
              ball: ballBytes,
              ballName: ball.heroName
            });
      if (scene?.kind === 'drawn' && /^[A-Za-z0-9+/=]+$/.test(scene.base64)) {
        html = html.replace(
          '</head>',
          `<style>:root{--scene:url(data:image/jpeg;base64,${scene.base64})}</style></head>`
        );
      } else {
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
    } else if (sample.heroScene !== undefined) {
      const render = deps.ai === null ? null : await fetchHeroImage(sample.heroScene.renderUrl);
      const scene =
        render === null || deps.ai === null
          ? null
          : await deps.ai.heroScene({
              hero: render,
              heroName: sample.heroScene.heroName,
              ...(sample.heroScene.scene === undefined ? {} : { scene: sample.heroScene.scene })
            });
      if (scene?.kind === 'drawn' && /^[A-Za-z0-9+/=]+$/.test(scene.base64)) {
        html = html.replace(
          '</head>',
          `<style>:root{--scene:url(data:image/jpeg;base64,${scene.base64})}</style></head>`
        );
      } else {
        sceneFailed(
          `${SCENE_LABELS[sample.heroScene.scene ?? 'anketa']} ${sample.heroScene.heroName}`,
          render === null
            ? `нет изображения героя ${sample.heroScene.heroName}`
            : scene?.kind === 'failed'
              ? sceneWhy(scene)
              : 'ИИ не подключён'
        );
      }
    } else if (sample.picture === null && deps.ai !== null) {
      const scene = await deps.ai.scene({ heading: pictureHeading(page.html) });
      if (scene.kind === 'drawn') html = withBackground(page.html, scene.base64);
      else {
        html = null;
        notes.push(`Сцена не нарисована (${sceneWhy(scene)}): пост без картинки.`);
      }
    }
    if (html !== null)
      try {
        picture = await deps.renderer.render(html, page, 'png');
      } catch (error) {
        log('failed', errorParts(error).code);
        throw new AppError('UNAVAILABLE', 'The picture was not rendered', {
          reason: describeError(error, 'screenshot')
        });
      }
  }
  if (sample.photo !== undefined) {
    const file = await deps.improvePhoto({
      bytes: await fetchPhoto(sample.photo.url),
      contentType: 'image/png',
      fileName: `${rubric}.png`
    });
    picture = file.bytes;
  }
  // An album's photos one by one; one that fails is left out, the album needs one.
  const album: { kind: 'photo' | 'video' | 'animation'; bytes: Uint8Array }[] = [];
  for (const [kind, urls] of [
    ['photo', sample.album?.photos ?? []],
    ['video', sample.album?.clips ?? []]
  ] as const) {
    for (const url of urls) {
      const bytes = await fetchPhoto(url).catch(() => null);
      // A Workshop screenshot is often an animated GIF: it goes as an animation, a photo would freeze it.
      const gif = bytes !== null && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46;
      if (bytes !== null) album.push({ kind: gif ? 'animation' : kind, bytes });
    }
  }
  // A sharp still of the hero opens the carousel (owner, 27.10.2026: «сначала фотку качественную самого персонажа»):
  // Workshop GIFs are 512 px with 256 colours. The author's still shot, else the set's cover, made sharper when narrow.
  album.sort((a, b) => ALBUM_ORDER[a.kind] - ALBUM_ORDER[b.kind]);
  if (sample.album?.cover !== undefined && album[0]?.kind !== 'photo') {
    const cover = await fetchPhoto(sample.album.cover).catch(() => null);
    if (cover !== null) album.unshift({ kind: 'photo', bytes: cover });
  }
  const first = album[0];
  if (first?.kind === 'photo') {
    first.bytes = (
      await deps.improvePhoto({ bytes: first.bytes, contentType: 'image/png', fileName: `${rubric}.png` })
    ).bytes;
  }
  // More pages of the post (the guide's «Чем отличается») follow the picture as one carousel; the free plan takes one
  // screenshot per 10 seconds.
  if (picture !== null && deps.renderer !== null && (sample.slides?.length ?? 0) > 0) {
    const pages: Uint8Array[] = [picture];
    for (const slide of sample.slides ?? []) {
      await new Promise((resolve) => setTimeout(resolve, BROWSER_GAP_MS));
      try {
        pages.push(await deps.renderer.render(slide.html, slide, 'png'));
      } catch (error) {
        notes.push(`Слайд не нарисован (${describeError(error, 'screenshot')}).`);
      }
    }
    if (pages.length > 1) {
      album.push(...pages.map((bytes) => ({ kind: 'photo' as const, bytes })));
      picture = null;
    }
  }
  if (sample.album !== undefined && album.length === 0) {
    throw new AppError('UNAVAILABLE', 'No photo of the album was fetched', { reason: 'PHOTO_FETCH' });
  }
  const written = await caption.catch(() => null);
  if (deps.ai !== null && !noWriter && written === null) notes.push('Текст — шаблон: ИИ его не написал.');
  // The footer stays word for word under the AI's text; links show as their words (text_link entities).
  const body = [written ?? sample.text, ...(sample.footer === undefined ? [] : [sample.footer])].join('\n\n');
  const linked = withLinks(body, sample.links ?? []);
  const text = linked.text;
  // A bold first line (a setup or a heading) as an entity: the text is sent plain.
  const lead = sample.boldLead === true ? (text.split('\n')[0] ?? '').length : 0;
  const entities = [...(lead > 0 ? [{ type: 'bold' as const, offset: 0, length: lead }] : []), ...linked.entities];

  // The second post (a riddle's answer) is drawn now too; the free plan takes one screenshot per 10 seconds.
  let followUpPicture: Uint8Array | null = null;
  const followUp = sample.followUp;
  if (followUp?.picture && deps.renderer !== null) {
    await new Promise((resolve) => setTimeout(resolve, BROWSER_GAP_MS));
    try {
      followUpPicture = await deps.renderer.render(followUp.picture.html, followUp.picture, 'png');
    } catch (error) {
      notes.push(`Картинка второго поста не нарисована (${describeError(error, 'screenshot')}).`);
    }
  }

  if (deps.mirror) {
    const stamp = `${new Date(deps.now).toISOString().replace(/[:.]/g, '-')}-${rubric}`;
    await deps
      .mirror(
        `samples/${stamp}.txt`,
        [text, '', ...notes.map((note) => `NOTE: ${note}`)].join('\n'),
        'text/plain; charset=utf-8'
      )
      .catch(() => undefined);
    if (picture !== null) await deps.mirror(`samples/${stamp}.png`, picture, 'image/png').catch(() => undefined);
    // A local run checks samples from the copy; nothing goes to Telegram (owner, 28.10.2026: «в тг ничего слать не надо»).
    log('sent');
    return;
  }

  try {
    const signal = () => AbortSignal.timeout(TELEGRAM_TIMEOUT_MS);
    if (notes.length > 0)
      await deps.telegram.sendMessage(
        deps.ownerChatId,
        [`«${title}»:`, ...notes].join('\n'),
        { ...FLAGS, entities: [] },
        signal()
      );
    // A rubric's own rich HTML marks where its picture goes; without a drawn picture that mark is dropped.
    const ownRich =
      sample.rich === undefined
        ? null
        : picture === null
          ? sample.rich.replace(RICH_MEDIA_SLOT, '')
          : expandRichMedia(sample.rich, [{ kind: 'photo' }]);
    const rich = pollOnly || album.length > 0 ? null : (ownRich ?? rubricRichHtml(text, picture !== null));
    if (album.length > 0) {
      // One rich message, the photos and GIFs as a carousel on top (owner, 27.10.2026: «формата rich, чтобы был как
      // карусель»), then the text, the verdict and the links as words.
      const extension = { photo: 'jpg', video: 'mp4', animation: 'gif' } as const;
      await deps.telegram.sendRichMessage(
        deps.ownerChatId,
        {
          html: albumRichHtml(body, sample.links ?? [], album),
          media: album.map(({ kind, bytes }, index) => ({
            id: richMediaId(index),
            kind,
            file: new InputFile(bytes, `${rubric}-${index + 1}.${extension[kind]}`)
          }))
        },
        FLAGS,
        signal()
      );
    } else if (pollOnly) {
      // The picture goes inside the poll (Bot API 10.3), no post before it (owner, 26.10.2026: «вся информация на
      // картинке и сразу опрос»).
    } else if (rich !== null) {
      await deps.telegram.sendRichMessage(
        deps.ownerChatId,
        {
          html: rich,
          media:
            picture === null
              ? []
              : [{ id: richMediaId(0), kind: 'photo', file: new InputFile(picture, `${rubric}.png`) }]
        },
        FLAGS,
        signal()
      );
    } else if (picture !== null) {
      await deps.telegram.sendPhoto(
        deps.ownerChatId,
        new InputFile(picture, `${rubric}.png`),
        { ...FLAGS, caption: text, caption_entities: entities },
        signal()
      );
    } else {
      await deps.telegram.sendMessage(deps.ownerChatId, text, { ...FLAGS, entities }, signal());
    }
    if (sample.poll !== null) {
      await deps.telegram.sendPoll(
        deps.ownerChatId,
        {
          ...FLAGS,
          question: sample.poll.question,
          options: sample.poll.options,
          type: sample.poll.type,
          // One answer, the options in a random order for each voter (owner, 26.10.2026).
          allows_multiple_answers: false,
          shuffle_options: true,
          ...(sample.poll.correctOption === null ? {} : { correct_option_ids: [sample.poll.correctOption] }),
          ...(sample.poll.explanation === null ? {} : { explanation: sample.poll.explanation }),
          ...(pollOnly && picture !== null
            ? { media: { type: 'photo' as const, media: new InputFile(picture, `${rubric}.png`) } }
            : {})
        },
        signal()
      );
    }
    if (followUp !== undefined) {
      // The channel gets it `afterMinutes` later; the owner's sample shows it at once, marked.
      await deps.telegram.sendMessage(
        deps.ownerChatId,
        followUp.afterMinutes === null
          ? 'Второй пост — в канале после выхода следующего патча; здесь сразу, по последнему патчу:'
          : `Второй пост — в канале через ${Math.round(followUp.afterMinutes / 60)} ч, здесь сразу:`,
        { ...FLAGS, entities: [] },
        signal()
      );
      if (followUpPicture !== null)
        await deps.telegram.sendPhoto(
          deps.ownerChatId,
          new InputFile(followUpPicture, `${rubric}-answer.png`),
          { ...FLAGS, caption: followUp.text, caption_entities: [] },
          signal()
        );
      else await deps.telegram.sendMessage(deps.ownerChatId, followUp.text, { ...FLAGS, entities: [] }, signal());
    }
  } catch (error) {
    log('failed', 'TELEGRAM_SEND');
    // Telegram's own refusal (method, HTTP status, e.g. «can't parse rich message») tells the owner which part it
    // rejected; `describeError` bounds it and strips secrets.
    throw new AppError('UNAVAILABLE', 'Telegram did not take the sample', { reason: describeError(error) });
  }
  log('sent');
}

/** What a sample needs beyond the container: the browser and STRATZ, read from the Worker's env by `lab-queue.ts`. */
export type RubricSampleAccess = {
  renderer: PictureRenderer | null;
  mirror?: SampleMirror | null;
  stratzAccess: { token: string; bridgeUrl?: string } | null;
};

/** The `rubric_sample` job: runs once per press and tells the owner in the chat when the sample could not be built. */
export async function runRubricSampleJob(
  container: Container,
  access: RubricSampleAccess,
  token: string,
  rubric: RubricKey,
  requestId: string,
  onError: (error: unknown) => void
): Promise<void> {
  const ownerChatId = container.ownerChatId;
  if (ownerChatId === null || token === '') return;
  const telegram = createTelegramApi(token);
  const { timezone } = await getOwnerOperationsSettings({
    repo: container.settings,
    logger: container.logger,
    requestId
  });
  const aiDeps = {
    repo: container.aiRepository,
    clock: container.clock,
    timezone,
    newId: container.newId,
    provider: container.aiProvider
  };
  try {
    await sendRubricSample(
      {
        gameFinds: async (since) => {
          const stored = await container.gameFileBuilds.recentFinds(since);
          return fillBareFinds(container, stored.length > 0 ? stored : await trackerFinds(container, since));
        },
        stratzAccess: access.stratzAccess,
        mirror: access.mirror ?? null,
        heroMatches: heroMatchSource(container),
        tellers: {
          used: () => container.systemState.readHoroscopeTellers(),
          remember: (heroIds) => container.systemState.rememberHoroscopeTellers(heroIds, container.clock.now())
        },
        turns: { next: (name) => container.systemState.nextTurn(name, container.clock.now()) },
        renderer: access.renderer,
        ai: {
          caption: (input) => writeRubricCaption(aiDeps, input),
          scene: (input) => drawRubricScene({ ...aiDeps, images: container.aiImageProvider, onError }, input),
          heroScene: ({ scene, ...input }) =>
            (scene === 'forgotten' ? drawForgottenScene : scene === 'suspect' ? drawSuspectScene : drawAnketaScene)(
              { ...aiDeps, images: container.aiImageProvider, onError },
              input
            ),
          fortuneScene: (input) => drawHoroscopeScene({ ...aiDeps, images: container.aiImageProvider, onError }, input)
        },
        improvePhoto: pictureImproverFor(container, requestId, onError, RUBRIC_PHOTO_MIN_WIDTH),
        telegram,
        ownerChatId,
        random: container.random,
        now: container.clock.now(),
        logger: container.logger,
        requestId
      },
      rubric
    );
  } catch (error) {
    onError(error);
    // «No data» names what was missing (a tier-list look, a bracket): the owner sees which part to look at.
    const missing =
      error instanceof AppError && error.details?.['reason'] === 'NO_DATA'
        ? `: ${error.message.replace(/^No data for the rubric: /, '').slice(0, 400)}`
        : '';
    const reason =
      error instanceof AppError ? `${error.details?.['reason'] ?? error.code}${missing}` : describeError(error);
    await access
      .mirror?.(
        `samples/${new Date(container.clock.now()).toISOString().replace(/[:.]/g, '-')}-${rubric}-FAILED.txt`,
        `образец не собран. ${reason}`,
        'text/plain; charset=utf-8'
      )
      .catch(() => undefined);
    await telegram
      .sendMessage(
        ownerChatId,
        `«${RUBRIC_TITLES[rubric]}»: образец не собран. ${reason}`,
        { ...FLAGS, entities: [] },
        AbortSignal.timeout(TELEGRAM_TIMEOUT_MS)
      )
      .catch(() => undefined);
  }
}
