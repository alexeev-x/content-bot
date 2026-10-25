import { InputFile } from 'grammy';
import { BrowserRenderError, type PictureRenderer } from '../../integrations/browser-render/browser-render';
import { createDotaConstantsApi, DotaConstantsError } from '../../integrations/dotaconstants/dotaconstants';
import type { GitHubRepoApi } from '../../integrations/github/github-api';
import { createSteamPublicApi, SteamPublicError } from '../../integrations/steam-public/steam-public';
import { createStratzApi, StratzError } from '../../integrations/stratz/stratz-api';
import { createTelegramApi, type TelegramSendApi } from '../../integrations/telegram/telegram-api';
import { createValveDatafeedApi, DatafeedError } from '../../integrations/valve-datafeed/valve-datafeed';
import { drawRubricVariants, writeRubricCaption } from '../../modules/ai';
import { parseBuildMessage } from '../../modules/game-files';
import {
  buildRubricSample,
  PICTURE_SIZE,
  RUBRIC_TITLES,
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

/** The free plan takes one screenshot per 10 seconds. */
const BROWSER_GAP_MS = 11_000;
const CAPTION_TIMEOUT_MS = 120_000;

type Variants = {
  background: { kind: 'drawn'; picture: string } | { kind: 'failed'; reason: string };
  cover: { kind: 'drawn'; picture: Uint8Array } | { kind: 'failed'; reason: string };
};

export type RubricSampleDeps = {
  gameFilesRepo: GitHubRepoApi | null;
  /** STRATZ through the stats bridge; null until both the token and the bridge are set. */
  stratzAccess: { token: string; bridgeUrl: string } | null;
  renderer: PictureRenderer | null;
  /** The AI writer's caption and the two drawn pictures; null when the AI is not wired. */
  ai: {
    caption: (input: {
      title: string;
      draft: string;
      poll: string | null;
      signal: AbortSignal;
    }) => Promise<string | null>;
    variants: (input: { title: string; content: Uint8Array }) => Promise<Variants>;
  } | null;
  telegram: TelegramSendApi;
  ownerChatId: string;
  random: () => number;
  now: number;
  logger: Logger;
  requestId: string;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)));

/**
 * One rubric the way production would post it (owner, 25.10.2026: «как будто продовская, через ИИ»): live data, the AI
 * writer's caption, and two pictures to compare — A, the drawn scene under the browser's exact icons and text, and B,
 * the whole picture drawn by the model after the browser's layout. A note says which is which and what failed.
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
  // The caption is written while the pictures are drawn.
  const caption =
    deps.ai === null
      ? Promise.resolve(null)
      : deps.ai.caption({ title, draft: sample.text, poll, signal: AbortSignal.timeout(CAPTION_TIMEOUT_MS) });

  const notes: string[] = [];
  const pictures: { bytes: Uint8Array; name: string }[] = [];
  if (sample.picture !== null) {
    if (deps.renderer === null) {
      throw new AppError('UNAVAILABLE', 'Browser Rendering is not bound here', { reason: 'BROWSER_NOT_BOUND' });
    }
    const renderer = deps.renderer;
    const render = async (html: string, format: 'png' | 'jpeg') => {
      try {
        return await renderer.render(html, sample.picture ?? PICTURE_SIZE, format);
      } catch (error) {
        const code = error instanceof BrowserRenderError ? error.code : 'BROWSER_FAILED';
        log('failed', code);
        throw new AppError('UNAVAILABLE', 'The picture was not rendered', { reason: code });
      }
    };
    const plain = await render(sample.picture.html, 'jpeg');
    const renderedAt = Date.now();
    if (deps.ai === null) {
      pictures.push({ bytes: plain, name: `${rubric}.jpg` });
      notes.push('ИИ не подключён: только точная картинка браузера.');
    } else {
      const { background, cover } = await deps.ai.variants({ title, content: plain });
      if (background.kind === 'drawn') {
        await wait(renderedAt + BROWSER_GAP_MS - Date.now());
        try {
          pictures.push({
            bytes: await render(withBackground(sample.picture.html, background.picture), 'png'),
            name: `${rubric}-a.png`
          });
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
          notes.push(`A не собралась: ${error.details?.['reason'] ?? error.code}.`);
        }
      } else notes.push(`A не нарисована: ${background.reason}.`);
      if (cover.kind === 'drawn') pictures.push({ bytes: cover.picture, name: `${rubric}-b.jpg` });
      else notes.push(`B не нарисована: ${cover.reason}.`);
      if (pictures.length === 0) pictures.push({ bytes: plain, name: `${rubric}.jpg` });
    }
  }
  const written = await caption.catch(() => null);
  if (deps.ai !== null && written === null) notes.push('Текст — шаблон: ИИ его не написал.');
  const text = written ?? sample.text;
  const both =
    pictures.some((each) => each.name.endsWith('-a.png')) && pictures.some((each) => each.name.endsWith('-b.jpg'));
  const header = [
    `«${title}»${both ? ': A — фон рисует ИИ, иконки и текст ставит браузер (точные); B — всю картинку рисует ИИ.' : ''}`,
    ...notes
  ].join('\n');

  try {
    const signal = () => AbortSignal.timeout(TELEGRAM_TIMEOUT_MS);
    await deps.telegram.sendMessage(deps.ownerChatId, header, { ...FLAGS, entities: [] }, signal());
    if (pictures.length > 1) {
      await deps.telegram.sendMediaGroup(
        deps.ownerChatId,
        pictures.map((each, index) => ({
          type: 'photo' as const,
          media: new InputFile(each.bytes, each.name),
          ...(index === 0 ? { caption: text, caption_entities: [] } : {})
        })),
        FLAGS,
        signal()
      );
    } else if (pictures[0] !== undefined) {
      await deps.telegram.sendPhoto(
        deps.ownerChatId,
        new InputFile(pictures[0].bytes, pictures[0].name),
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
          allows_multiple_answers: false,
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
          variants: (input) => drawRubricVariants({ ...aiDeps, images: container.aiImageProvider, onError }, input)
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
