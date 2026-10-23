import type { SendRichSamplesResponse } from '@alexeev/contracts';
import { GrammyError } from 'grammy';
import type { TelegramRichMessageApi } from '../../integrations/telegram/telegram-api';
import type { Logger } from '../../platform/logging/logger';

// The DEV look at Telegram rich messages (Bot API 10.1–10.3) before any post is rebuilt (owner, 23.10.2026). The texts
// are the channel's real recent topics, taken from posts already written; nothing calls the AI. Pictures come from
// Valve's CDN by URL, and one goes as an upload (`tg://photo?id=`), the way our own R2 pictures would.

const SEND_TIMEOUT_MS = 10_000;
const UPLOAD_TIMEOUT_MS = 8_000;
const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const ERROR_MAX = 300;

const CDN = 'https://cdn.steamstatic.com/apps/dota2';
const hero = (name: string) => `${CDN}/images/dota_react/heroes/${name}.png`;
const UPLOAD = { id: 'carnival_rewards', url: `${CDN}/images/dota_react/darkcarnival/overworld/reward_treasure.png` };

type Sample = { title: string; targets: ('channel' | 'owner')[]; classic?: boolean; html: string };

// 7.41f: the AI writer's post of 22.10.2026, laid out with a heading, a mark, a table and a folded block.
const PATCH = `<h3>Вышел 7.41f</h3>
<p>Главное: <mark>Тренту порезали базовый интеллект</mark>, инвиз после выхода из деревьев держится вдвое меньше, а талант на усиление лечения Living Armor заменили на +3 секунды действия.</p>
<tg-collage><img src="${hero('treant')}"/><img src="${hero('lina')}"/><img src="${hero('keeper_of_the_light')}"/><img src="${hero('bounty_hunter')}"/><img src="${hero('earth_spirit')}"/></tg-collage>
<h4>Кого порезали и кого подняли</h4>
<table bordered striped compact>
<tr><th>Герой</th><th>Что поменяли</th><th>Итог</th></tr>
<tr><td>Трент</td><td>меньше интеллекта, инвиз вдвое короче</td><td align="center">🔻</td></tr>
<tr><td>Лина</td><td>слабее бьёт с руки на старте, меньше скорости атаки</td><td align="center">🔻</td></tr>
<tr><td>Котл</td><td>хуже лечит Illuminate, меньше сокращает перезарядки</td><td align="center">🔻</td></tr>
<tr><td>БХ</td><td>+190 урона сюрикена уже на 20-м, общий обзор от Track на 25-м</td><td align="center">↕️</td></tr>
<tr><td>Earth Spirit</td><td>+200 урона Geomagnetic Grip от ремнанта, ниже базовая скорость атаки</td><td align="center">↕️</td></tr>
</table>
<details><summary>Предметы</summary><ul>
<li>Капли дают на четверть меньше регена маны</li>
<li>Satanic и Mask of Madness слабее вампирят</li>
<li>У сильвера чуть дольше откат инвиза и меньше бонус скорости</li>
<li>Battle Fury рубит деревья раз в 3 секунды вместо 4</li>
</ul></details>
<p><a href="https://www.dota2.com/patches/7.41f">Все изменения</a></p>`;

// The Dark Carnival: the event series' first post, from Valve's announcement and the event page.
const EVENT = `<h3>The Dark Carnival</h3>
<p>Valve открыла карнавал: просыпаешься в тюремном вагоне без памяти, а тебя уже поймал злой кукловод. Внутри события — сюжет, автоматоны-персоны и своё сокровище.</p>
<figure><img src="tg://photo?id=${UPLOAD.id}"/><figcaption>Награды карнавала<cite>Valve</cite></figcaption></figure>
<blockquote expandable>Don't you hate it when you wake up in a prison car with no memory of how you got there and, worse, no way to escape, only to discover you've been captured by an evil puppet-man as part of some dark bargain with an ancient world-conquering…<cite>Valve, анонс события</cite></blockquote>
<tg-button-row><tg-button type="url" url="https://www.dota2.com/darkcarnival">Страница события</tg-button></tg-button-row>`;

// The treasure follow-up: the sets in rarity order (the event page's slider), with the prices Valve gives by item id.
const TREASURE = `<h3>Сокровище карнавала: сеты</h3>
<tg-slideshow><img src="${CDN}/videos/dota_react/darkcarnival/treasure/set_pudge.png"/><img src="${CDN}/videos/dota_react/darkcarnival/treasure/set_io.png"/><figcaption>От обычного к самому редкому</figcaption></tg-slideshow>
<table bordered compact>
<tr><th>Герой</th><th>Сет</th></tr>
<tr><td>Pudge</td><td>The Woodcutter</td></tr>
<tr><td>Io</td><td><mark>Madame Scrio</mark> — самая редкая</td></tr>
</table>
<h4>Цены Valve</h4>
<table striped compact>
<tr><td>Персоны-автоматоны</td><td align="right">$14.99</td></tr>
<tr><td>Secret Room Pack</td><td align="right">$14.99</td></tr>
</table>
<footer>Источник: Liquipedia, dota2.com</footer>`;

// A news post: the Steam announcement of 7.41e and Summer Scrub.
const NEWS = `<h3>7.41e и Summer Scrub</h3>
<p>The International всё ближе, и Valve выкатила обновление к нему:</p>
<ul>
<li>прогнозы и фэнтези;</li>
<li>наборы поддержки команд;</li>
<li><b>Summer Scrub</b>: докажи скилл и получи новые Immortal-предметы и ландшафты.</li>
</ul>
<p>Баланс — в отдельном посте про 7.41e.</p>
<footer>Источник: Steam</footer>
<tg-button-row><tg-button type="url" url="https://store.steampowered.com/news/app/570/view/1839676055886687">Анонс в Steam</tg-button></tg-button-row>`;

// A find in the game files: build 6962 of SteamTracking/GameTracking-Dota2 (Primal Beast's new effect slots).
const DIFF = `-				"SlotIndex"		"6"
+				"SlotIndex" "6"
+				"SlotName" "ability_effects_2"
+				"SlotText" "primal_beast_trample"
+			}
+			"7"
+			{
+				"SlotName" "ability_effects_3"
+				"SlotText" "primal_beast_uproar"
+			}
+			"8"
+			{
+				"SlotName" "ability_effects_4"
+				"SlotText" "primal_beast_rock_throw"`;
const COMMIT = 'https://github.com/SteamTracking/GameTracking-Dota2/commit/282fad29f0f74504fad465c52d197fb61f4d612b';
const DATAMINE_TEXT =
  'В файлах игры нашли (по данным SteamDB): у Primal Beast появились отдельные слоты эффектов для Trample, Uproar, Rock Throw, Pulverize и Colossal. Похоже на кастомные эффекты способностей. Valve не подтверждала, может измениться.';
const DATAMINE = `<h4>Нашли в файлах игры</h4>
<p>${DATAMINE_TEXT}</p>
<pre><code class="language-diff">${escapeHtml(DIFF)}</code></pre>
<p><a href="${COMMIT}">Коммит билда 6962</a></p>`;
const DATAMINE_CLASSIC = `<b>Нашли в файлах игры</b>

${DATAMINE_TEXT}

<pre><code class="language-diff">${escapeHtml(DIFF)}</code></pre>
<a href="${COMMIT}">Коммит билда 6962</a>`;

// The daily report as a rich table; the numbers only show the layout.
const REPORT = `<h3>📈 Аналитика · 22 октября</h3>
<p><i>Образец вёрстки: цифры условные.</i></p>
<table bordered striped compact>
<caption>YouTube за сутки</caption>
<tr><th>#</th><th>Ролик</th><th align="right">Просмотры</th><th align="right">+24 ч</th></tr>
<tr><td>1</td><td>Трент после 7.41f</td><td align="right">12.4к</td><td align="right">+3.1к</td></tr>
<tr><td>2</td><td>Сокровище карнавала</td><td align="right">8.9к</td><td align="right">+1.7к</td></tr>
<tr><td>3</td><td>Лина без урона</td><td align="right">5.2к</td><td align="right">+640</td></tr>
</table>
<details><summary>🧠 Разбор</summary><p>Ролики про патч растут быстрее остальных: <mark>патч в первые сутки</mark> держит внимание.</p></details>
<p>🎯 Прогнозы за сутки: 4 из 5 в диапазоне</p>`;

const SAMPLES: Sample[] = [
  { title: 'Патч 7.41f', targets: ['channel', 'owner'], html: PATCH },
  { title: 'Ивент: The Dark Carnival', targets: ['channel', 'owner'], html: EVENT },
  { title: 'Сокровище: сеты', targets: ['channel', 'owner'], html: TREASURE },
  { title: 'Новость: 7.41e и Summer Scrub', targets: ['channel', 'owner'], html: NEWS },
  { title: 'Файлы игры (rich)', targets: ['channel', 'owner'], html: DATAMINE },
  { title: 'Файлы игры (обычный pre)', targets: ['channel', 'owner'], classic: true, html: DATAMINE_CLASSIC },
  { title: 'Отчёт аналитики', targets: ['owner'], html: REPORT }
];

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The picture sent as an upload; null when Valve's CDN fails, and the event sample then shows it by URL. */
async function fetchUpload(fetcher: typeof fetch): Promise<Uint8Array | null> {
  try {
    const response = await fetcher(UPLOAD.url, { signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS) });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.byteLength > 0 && bytes.byteLength <= UPLOAD_MAX_BYTES ? bytes : null;
  } catch {
    return null;
  }
}

/** Telegram's «Bad Request» text tells which tag it refused; other failures stay a code (a description may echo the path). */
function failureText(error: unknown, signal: AbortSignal): string {
  if (signal.aborted) return 'timeout';
  if (error instanceof GrammyError) {
    return error.description.startsWith('Bad Request')
      ? error.description.slice(0, ERROR_MAX)
      : `telegram_http_${error.error_code}`;
  }
  return 'network_error';
}

export async function sendRichSamples(deps: {
  api: TelegramRichMessageApi;
  fetch: typeof fetch;
  channelChatId: string;
  ownerChatId: string;
  logger: Logger;
  requestId: string;
}): Promise<SendRichSamplesResponse> {
  const upload = await fetchUpload(deps.fetch);
  const results: SendRichSamplesResponse['results'] = [];
  for (const sample of SAMPLES) {
    const html = upload === null ? sample.html.replace(`tg://photo?id=${UPLOAD.id}`, UPLOAD.url) : sample.html;
    const uploads =
      upload !== null && html.includes(`tg://photo?id=${UPLOAD.id}`)
        ? [{ id: UPLOAD.id, fileName: 'carnival-rewards.png', bytes: upload }]
        : [];
    for (const target of sample.targets) {
      const chatId = target === 'channel' ? deps.channelChatId : deps.ownerChatId;
      const signal = AbortSignal.timeout(SEND_TIMEOUT_MS);
      try {
        if (sample.classic === true) await deps.api.sendClassicHtml(chatId, html, signal);
        else await deps.api.sendRichMessage(chatId, { html, uploads }, signal);
        results.push({ sample: sample.title, target, status: 'sent', error: null });
      } catch (error) {
        const text = failureText(error, signal);
        deps.logger.warn({
          component: 'rich-samples',
          operation: 'send',
          requestId: deps.requestId,
          status: 502,
          errorCode: error instanceof GrammyError ? `telegram_http_${error.error_code}` : text
        });
        results.push({ sample: sample.title, target, status: 'failed', error: text });
      }
    }
  }
  return { results };
}
