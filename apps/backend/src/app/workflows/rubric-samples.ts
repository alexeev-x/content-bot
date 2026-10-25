import { InputFile } from 'grammy';
import { BrowserRenderError, type PictureRenderer } from '../../integrations/browser-render/browser-render';
import { createDotaConstantsApi, DotaConstantsError } from '../../integrations/dotaconstants/dotaconstants';
import type { GitHubRepoApi } from '../../integrations/github/github-api';
import { createSteamPublicApi, SteamPublicError } from '../../integrations/steam-public/steam-public';
import { createStratzApi, StratzError } from '../../integrations/stratz/stratz-api';
import type { TelegramSendApi } from '../../integrations/telegram/telegram-api';
import { createValveDatafeedApi, DatafeedError } from '../../integrations/valve-datafeed/valve-datafeed';
import { parseBuildMessage } from '../../modules/game-files';
import { buildRubricSample, type RubricKey, type RubricSources } from '../../modules/rubrics';
import type { Logger } from '../../platform/logging/logger';
import { AppError } from '../../shared/app-error';

// DEV only (owner, 25.10.2026): one rubric's post from live data — the picture rendered by the browser from Valve's
// icons, the caption, the poll — goes to the owner's chat with the bot, the way subscribers would see it.

const TELEGRAM_TIMEOUT_MS = 20_000;
const FLAGS = { disable_notification: false, protect_content: false } as const;

function rubricSources(gameFilesRepo: GitHubRepoApi | null, stratzToken: string | null): RubricSources {
  const stratz = stratzToken === null ? null : createStratzApi({ token: stratzToken });
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

function sourceErrorCode(error: unknown): string | null {
  if (
    error instanceof DotaConstantsError ||
    error instanceof DatafeedError ||
    error instanceof SteamPublicError ||
    error instanceof StratzError
  ) {
    return error.code;
  }
  return null;
}

export async function sendRubricSample(
  deps: {
    gameFilesRepo: GitHubRepoApi | null;
    stratzToken: string | null;
    renderer: PictureRenderer | null;
    telegram: TelegramSendApi;
    ownerChatId: string;
    random: () => number;
    now: number;
    logger: Logger;
    requestId: string;
  },
  rubric: RubricKey
): Promise<{ messages: number; picture: boolean }> {
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
      sources: rubricSources(deps.gameFilesRepo, deps.stratzToken),
      random: deps.random,
      now: deps.now
    });
  } catch (error) {
    const code = sourceErrorCode(error);
    if (code !== null) {
      log('failed', code);
      throw new AppError('UNAVAILABLE', 'A data source did not answer', { reason: code });
    }
    if (error instanceof AppError) log('failed', error.details?.['reason'] ?? error.code);
    throw error;
  }

  let png: Uint8Array | null = null;
  if (sample.picture !== null) {
    if (deps.renderer === null) {
      throw new AppError('UNAVAILABLE', 'Browser Rendering is not bound here', { reason: 'BROWSER_NOT_BOUND' });
    }
    try {
      png = await deps.renderer.render(sample.picture.html, sample.picture);
    } catch (error) {
      const code = error instanceof BrowserRenderError ? error.code : 'BROWSER_FAILED';
      log('failed', code);
      throw new AppError('UNAVAILABLE', 'The picture was not rendered', { reason: code });
    }
  }

  let messages = 0;
  try {
    if (png !== null) {
      await deps.telegram.sendPhoto(
        deps.ownerChatId,
        new InputFile(png, `${rubric}.png`),
        { ...FLAGS, caption: sample.text, caption_entities: [] },
        AbortSignal.timeout(TELEGRAM_TIMEOUT_MS)
      );
    } else {
      await deps.telegram.sendMessage(
        deps.ownerChatId,
        sample.text,
        { ...FLAGS, entities: [] },
        AbortSignal.timeout(TELEGRAM_TIMEOUT_MS)
      );
    }
    messages += 1;
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
        AbortSignal.timeout(TELEGRAM_TIMEOUT_MS)
      );
      messages += 1;
    }
  } catch {
    log('failed', 'TELEGRAM_SEND');
    throw new AppError('UNAVAILABLE', 'Telegram did not take the sample', {
      reason: 'TELEGRAM_SEND',
      sent: String(messages)
    });
  }
  log('sent');
  return { messages, picture: png !== null };
}
