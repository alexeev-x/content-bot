import { enhancePicture } from '../../modules/ai';
import { getOwnerOperationsSettings } from '../../modules/settings';
import type { AiJob } from '../bot/ai-job';
import type { Container } from '../container';

// The DEV trial of making small pictures sharper (owner, 23.10.2026): five Trove of Terror set icons from Liquipedia
// (256×170, the only size any source has) go through the image model, and each comes to the owner's chat as
// before/after with the call's cost. Nothing is published; the owner judges whether a set stayed the same.

const LIQUIPEDIA_IMAGES = 'https://liquipedia.net/commons/images';
const ICONS: { name: string; path: string }[] = [
  { name: 'Maw of the Megalodon', path: '6/67/Cosmetic_icon_Maw_of_the_Megalodon.png' },
  { name: 'Sepulchral Stalker', path: 'a/a6/Cosmetic_icon_Sepulchral_Stalker.png' },
  { name: "Hell's Legion", path: 'a/a0/Cosmetic_icon_Hell%27s_Legion.png' },
  { name: 'Curse of the Wyrmbender', path: '1/1c/Cosmetic_icon_Curse_of_the_Wyrmbender.png' },
  { name: 'Stoneback Sovereign', path: 'f/f2/Cosmetic_icon_Stoneback_Sovereign.png' }
];
const FETCH_TIMEOUT_MS = 15_000;
const ICON_MAX_BYTES = 2 * 1024 * 1024;
const TELEGRAM_TIMEOUT_MS = 30_000;
// Liquipedia's terms ask for a User-Agent naming the project and a contact: the one modules/dota/liquipedia.ts sends.
const USER_AGENT = 'AlexeevContentBot/1.0 (https://github.com/alexeev-x/content-bot; al93wswha@gmail.com)';

const dollars = (micro: number | null) => (micro === null ? 'цена не известна' : `$${(micro / 1_000_000).toFixed(3)}`);

async function fetchIcon(container: Container, path: string): Promise<Uint8Array | null> {
  try {
    const call = container.contentFetch;
    const response = await call(`${LIQUIPEDIA_IMAGES}/${path}`, {
      headers: { 'user-agent': USER_AGENT, 'accept-encoding': 'gzip' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.byteLength > 0 && bytes.byteLength <= ICON_MAX_BYTES ? bytes : null;
  } catch {
    return null;
  }
}

export async function runPictureTrial(
  container: Container,
  job: Extract<AiJob, { kind: 'picture_trial' }>,
  requestId: string,
  onError: (error: unknown) => void
): Promise<void> {
  // Paid calls: a redelivered message runs nothing.
  if (!(await container.aiWriter.claimJob(job.id, container.clock.now()))) return;
  const api = container.richMessages;
  if (api === null) return;
  const chatId = String(job.chatId);
  const say = (text: string) =>
    api.sendClassicHtml(chatId, text, AbortSignal.timeout(TELEGRAM_TIMEOUT_MS)).catch(onError);
  const { timezone } = await getOwnerOperationsSettings({
    repo: container.settings,
    logger: container.logger,
    requestId
  });
  let total = 0;
  for (const icon of ICONS) {
    const before = await fetchIcon(container, icon.path);
    if (before === null) {
      await say(`${icon.name}: Liquipedia не отдала иконку.`);
      continue;
    }
    const result = await enhancePicture(
      {
        repo: container.aiRepository,
        clock: container.clock,
        timezone,
        newId: container.newId,
        provider: container.aiProvider,
        images: container.aiImageProvider,
        onError
      },
      before
    );
    if (result.kind === 'failed') {
      const why = result.reason === 'unavailable' ? 'ИИ выключен, нет ключа или бюджета' : 'вызов ИИ не удался';
      await say(`${icon.name}: не улучшилось — ${why}.`);
      if (result.reason === 'unavailable') break;
      continue;
    }
    total += result.costMicroUsd ?? 0;
    await api
      .sendPhotoPair(
        chatId,
        {
          first: before,
          second: result.bytes,
          caption: `${icon.name}: слева было (256×170), справа после ИИ · ${dollars(result.costMicroUsd)}`
        },
        AbortSignal.timeout(TELEGRAM_TIMEOUT_MS)
      )
      .catch(onError);
  }
  await say(`Проверка улучшения картинок закончена. Всего: ${dollars(total)}.`);
  await container.aiWriter.finishJob(job.id, container.clock.now());
}
