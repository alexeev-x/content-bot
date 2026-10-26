import { richMediaId } from '@alexeev/contracts';
import { InputFile } from 'grammy';
import { BrowserRenderError, type PictureRenderer } from '../../integrations/browser-render/browser-render';
import { createDotaConstantsApi, DotaConstantsError } from '../../integrations/dotaconstants/dotaconstants';
import type { GitHubRepoApi } from '../../integrations/github/github-api';
import { createSteamPublicApi, SteamPublicError } from '../../integrations/steam-public/steam-public';
import { createStratzApi, StratzError } from '../../integrations/stratz/stratz-api';
import { createTelegramApi, type TelegramSendApi } from '../../integrations/telegram/telegram-api';
import { createValveDatafeedApi, DatafeedError } from '../../integrations/valve-datafeed/valve-datafeed';
import { drawRubricScene, writeRubricCaption } from '../../modules/ai';
import { parseBuildMessage } from '../../modules/game-files';
import {
  buildRubricSample,
  pictureHeading,
  RUBRIC_TITLES,
  titlePicture,
  rubricRichHtml,
  type RubricKey,
  type RubricSources,
  withBackground
} from '../../modules/rubrics';
import type { Logger } from '../../platform/logging/logger';
import { getOwnerOperationsSettings } from '../../modules/settings';
import { AppError } from '../../shared/app-error';
import type { Container } from '../container';

// DEV only (owner, 25.10.2026): one rubric's post from live data — the picture rendered by the browser from Valve's
// icons, the caption, the poll — goes to the owner's chat with the bot, the way subscribers would see it.

const TELEGRAM_TIMEOUT_MS = 20_000;
const FLAGS = { disable_notification: false, protect_content: false } as const;

function rubricSources(
  gameFilesRepo: GitHubRepoApi | null,
  stratzAccess: { token: string; bridgeUrl: string } | null
): RubricSources {
  const stratz = stratzAccess === null ? null : createStratzApi(stratzAccess);
  const constants = createDotaConstantsApi();
  const datafeed = createValveDatafeedApi();
  const steam = createSteamPublicApi();
  return {
    heroes: () => constants.heroes(),
    items: () => constants.items(),
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
          values: ability.values.map((value) => ({ heading: value.heading, values: value.values }))
        }))
      };
    },
    patches: () => datafeed.patchList(),
    async patchNotes(version) {
      const notes = await datafeed.patchNotes(version);
      return { version: notes.version, timestamp: notes.timestamp, heroes: notes.heroes };
    },
    steamNews: () => steam.dotaNews(),
    workshopTrending: () => steam.workshopTrending(),
    gameBuilds: () =>
      gameFilesRepo === null
        ? null
        : gameFilesRepo.listCommits(30).then((commits) =>
            commits.flatMap((commit) => {
              const header = parseBuildMessage(commit.message);
              return header === null
                ? []
                : [{ build: header.build, paths: header.paths, committedAt: commit.committedAt }];
            })
          ),
    stats:
      stratz === null
        ? null
        : {
            async heroBracketStats(bracket) {
              const rows = await stratz.heroWeeks(bracket, 1);
              return rows.map((row) => ({ heroId: row.heroId, bracket, matches: row.matches, wins: row.wins }));
            },
            async heroLateItems(heroId) {
              // Items bought from minute 20 on, most bought first.
              const totals = new Map<number, number>();
              for (const row of await stratz.heroPurchases(heroId)) {
                if (row.minute >= 20) totals.set(row.itemId, (totals.get(row.itemId) ?? 0) + row.matches);
              }
              return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([itemId]) => itemId);
            },
            heroPurchases: (heroId) => stratz.heroPurchases(heroId),
            heroTimeline: (heroId) => stratz.heroTimeline(heroId),
            positions: () => stratz.positions(),
            twoWeeks: (bracket) => stratz.heroWeeks(bracket, 2),
            averages: () => stratz.averages()
          }
  };
}

function sourceError(error: unknown): { code: string; status: number | null } | null {
  if (
    error instanceof DotaConstantsError ||
    error instanceof DatafeedError ||
    error instanceof SteamPublicError ||
    error instanceof StratzError
  ) {
    return { code: error.code, status: error.httpStatus };
  }
  return null;
}

const CAPTION_TIMEOUT_MS = 120_000;

type Scene = { kind: 'drawn'; base64: string } | { kind: 'failed'; reason: string };

export type RubricSampleDeps = {
  gameFilesRepo: GitHubRepoApi | null;
  /** STRATZ through the stats bridge; null until both the token and the bridge are set. */
  stratzAccess: { token: string; bridgeUrl: string } | null;
  renderer: PictureRenderer | null;
  /** The AI writer's caption and the drawn scene with the title; null when the AI is not wired. */
  ai: {
    caption: (input: {
      title: string;
      draft: string;
      poll: string | null;
      signal: AbortSignal;
    }) => Promise<string | null>;
    scene: (input: { heading: { text: string; red: string | null } | null }) => Promise<Scene>;
  } | null;
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
      sources: rubricSources(deps.gameFilesRepo, deps.stratzAccess),
      random: deps.random,
      now: deps.now
    });
  } catch (error) {
    const source = sourceError(error);
    if (source !== null) {
      log('failed', source.code);
      // The source's HTTP status tells a wrong key (401) from a refused address (403).
      throw new AppError('UNAVAILABLE', 'A data source did not answer', {
        reason: source.code,
        ...(source.status === null ? {} : { status: String(source.status) })
      });
    }
    if (error instanceof AppError) log('failed', error.details?.['reason'] ?? error.code);
    throw error;
  }

  const title = RUBRIC_TITLES[rubric];
  const poll = sample.poll === null ? null : `${sample.poll.question} — ${sample.poll.options.join(' / ')}`;
  // The caption is written while the scene is drawn.
  const caption =
    deps.ai === null
      ? Promise.resolve(null)
      : deps.ai.caption({ title, draft: sample.text, poll, signal: AbortSignal.timeout(CAPTION_TIMEOUT_MS) });

  const notes: string[] = [];
  let picture: Uint8Array | null = null;
  // Every rubric gets a picture for now (owner, 25.10.2026: «пусть ИИ рисует для всех, а там уже отбросим»): one with
  // no layout of its own is the drawn scene with its title alone, and none at all when the scene is not drawn.
  const page = sample.picture ?? (deps.ai === null ? null : titlePicture(title));
  if (page !== null) {
    if (deps.renderer === null) {
      throw new AppError('UNAVAILABLE', 'Browser Rendering is not bound here', { reason: 'BROWSER_NOT_BOUND' });
    }
    let html: string | null = page.html;
    // A rubric with a layout of its own is drawn by code alone on the flat style (owner, 26.10.2026); only a rubric
    // with no layout gets the model's scene under its title.
    if (sample.picture === null && deps.ai !== null) {
      const scene = await deps.ai.scene({ heading: pictureHeading(page.html) });
      if (scene.kind === 'drawn') html = withBackground(page.html, scene.base64);
      else {
        html = null;
        notes.push(`Сцена не нарисована (${scene.reason}): пост без картинки.`);
      }
    }
    if (html !== null)
      try {
        picture = await deps.renderer.render(html, page, 'png');
      } catch (error) {
        const code = error instanceof BrowserRenderError ? error.code : 'BROWSER_FAILED';
        log('failed', code);
        throw new AppError('UNAVAILABLE', 'The picture was not rendered', { reason: code });
      }
  }
  const written = await caption.catch(() => null);
  if (deps.ai !== null && written === null) notes.push('Текст — шаблон: ИИ его не написал.');
  const text = written ?? sample.text;

  try {
    const signal = () => AbortSignal.timeout(TELEGRAM_TIMEOUT_MS);
    if (notes.length > 0)
      await deps.telegram.sendMessage(
        deps.ownerChatId,
        [`«${title}»:`, ...notes].join('\n'),
        { ...FLAGS, entities: [] },
        signal()
      );
    const rich = rubricRichHtml(text, picture !== null);
    if (rich !== null) {
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
        { ...FLAGS, caption: text, caption_entities: [] },
        signal()
      );
    } else {
      await deps.telegram.sendMessage(deps.ownerChatId, text, { ...FLAGS, entities: [] }, signal());
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
          ...(sample.poll.explanation === null ? {} : { explanation: sample.poll.explanation })
        },
        signal()
      );
    }
  } catch {
    log('failed', 'TELEGRAM_SEND');
    throw new AppError('UNAVAILABLE', 'Telegram did not take the sample', { reason: 'TELEGRAM_SEND' });
  }
  log('sent');
}

/** The `rubric_sample` job: runs once per press and tells the owner in the chat when the sample could not be built. */
export async function runRubricSampleJob(
  container: Container,
  token: string,
  rubric: RubricKey,
  requestId: string,
  onError: (error: unknown) => void
): Promise<void> {
  const access = container.rubricSamples;
  const ownerChatId = container.ownerChatId;
  if (access === null || ownerChatId === null || token === '') return;
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
        gameFilesRepo: container.gameFilesRepo,
        stratzAccess: access.stratzAccess,
        renderer: access.renderer,
        ai: {
          caption: (input) => writeRubricCaption(aiDeps, input),
          scene: (input) => drawRubricScene({ ...aiDeps, images: container.aiImageProvider, onError }, input)
        },
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
    const reason =
      error instanceof AppError
        ? `${error.details?.['reason'] ?? error.code}${error.details?.['status'] ? `, HTTP ${error.details['status']}` : ''}`
        : 'ошибка сервера';
    await telegram
      .sendMessage(
        ownerChatId,
        `«${RUBRIC_TITLES[rubric]}»: образец не собран (${reason}).`,
        { ...FLAGS, entities: [] },
        AbortSignal.timeout(TELEGRAM_TIMEOUT_MS)
      )
      .catch(() => undefined);
  }
}
