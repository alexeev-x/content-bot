import { InputFile } from 'grammy';
import { BrowserRenderError, type PictureRenderer } from '../../integrations/browser-render/browser-render';
import { OpenDotaApiError, type OpenDotaApi } from '../../integrations/opendota/opendota-api';
import type { TelegramSendApi } from '../../integrations/telegram/telegram-api';
import { buildRubricSample, type RubricKey } from '../../modules/rubrics';
import type { Logger } from '../../platform/logging/logger';
import { AppError } from '../../shared/app-error';

// DEV only (owner, 25.10.2026): one rubric's post from live OpenDota data — the picture rendered by the browser from
// Valve's icons, the caption, the poll — goes to the owner's chat with the bot, the way subscribers would see it.

const TELEGRAM_TIMEOUT_MS = 20_000;
const FLAGS = { disable_notification: false, protect_content: false } as const;

export async function sendRubricSample(
  deps: {
    opendota: OpenDotaApi;
    renderer: PictureRenderer | null;
    telegram: TelegramSendApi;
    ownerChatId: string;
    random: () => number;
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
    sample = await buildRubricSample(rubric, { data: deps.opendota, random: deps.random });
  } catch (error) {
    if (error instanceof OpenDotaApiError) {
      log('failed', error.code);
      throw new AppError('UNAVAILABLE', 'OpenDota did not answer', { reason: error.code });
    }
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
