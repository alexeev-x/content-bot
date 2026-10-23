import type { SendRichSamplesResponse } from '@alexeev/contracts';
import { GrammyError } from 'grammy';
import { z } from 'zod';
import { listReports } from '../../modules/content-analytics';
import type { TelegramRichMessageApi } from '../../integrations/telegram/telegram-api';
import type { Logger } from '../../platform/logging/logger';
import type { Container } from '../container';

// The DEV look at Telegram rich messages (Bot API 10.1–10.3) before any post is rebuilt (owner, 23.10.2026). The texts
// are the channel's real recent topics, taken from posts already written; nothing calls the AI. The owner's rules
// (23.10.2026): one picture per post, no English text but names, no «Источник», only «Подробнее» to dota2.com.

const SEND_TIMEOUT_MS = 10_000;
const UPLOAD_TIMEOUT_MS = 8_000;
const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const ERROR_MAX = 300;

const CDN = 'https://cdn.steamstatic.com/apps/dota2';
// Uploaded (`tg://photo?id=`), the way our own R2 pictures go; without the bytes the event shows it by URL.
const CARNIVAL = { id: 'carnival_rewards', url: `${CDN}/images/dota_react/darkcarnival/overworld/reward_treasure.png` };
// The newest patch picture from the studio's library; without it the patch sample has no picture.
const COVER_ID = 'patch_cover';

type Sample = { title: string; targets: ('channel' | 'owner')[]; classic?: boolean; html: string };

const more = (url: string) => `<tg-button-row><tg-button type="url" url="${url}">Подробнее</tg-button></tg-button-row>`;

// 7.41f: the AI writer's post of 22.10.2026, laid out with a heading, a mark, a table and a folded block.
const PATCH = `<h3>Вышел 7.41f</h3>
<figure><img src="tg://photo?id=${COVER_ID}"/></figure>
<p>Главное: <mark>Тренту порезали базовый интеллект</mark>, инвиз после выхода из деревьев держится вдвое меньше, а талант на усиление лечения Living Armor заменили на +3 секунды действия.</p>
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
${more('https://www.dota2.com/patches/7.41f')}`;

// The Dark Carnival: the event series' first post, from Valve's announcement (retold in Russian) and the event page.
const EVENT = `<h3>The Dark Carnival</h3>
<p>Valve открыла карнавал: просыпаешься в тюремном вагоне без памяти, а тебя уже поймал злой кукловод. Внутри события — сюжет, автоматоны-персоны и своё сокровище.</p>
<figure><img src="tg://photo?id=${CARNIVAL.id}"/></figure>
<blockquote expandable>Просыпаешься в тюремном вагоне и не помнишь, как туда попал. Сбежать нельзя, а потом выясняется, что тебя поймал злой кукловод: это часть тёмной сделки с древним существом, которое хочет захватить мир…</blockquote>
${more('https://www.dota2.com/darkcarnival')}`;

// The treasure follow-up: every set in the event page's order (from common to the rarest) and Valve's prices.
const SETS: [string, string][] = [
  ['Drow Ranger', 'Motley Marauder'],
  ['Undying', 'Court Fester'],
  ['Queen of Pain', 'Mistress of Ceremonies'],
  ['Arc Warden', 'Palms of Prophecy'],
  ['Troll Warlord', 'Lute and Pillager'],
  ['Death Prophet', 'Mademoiselle Macabaret'],
  ['Phantom Lancer', 'Flim-Flam Felidae'],
  ['Dawnbreaker', 'Bar Belle'],
  ['Templar Assassin', 'Vaudevillain'],
  ['Monkey King', 'Bonobo the Clown'],
  ['Pudge', 'The Woodcutter (с персоной)'],
  ['Primal Beast', 'Mane Attraction'],
  ['Mirana', 'Selemene Showgirl'],
  ['Dark Willow', 'Fairy Godmummer'],
  ['Io', '<mark>Madame Scrio</mark> — самая редкая']
];
const TREASURE = `<h3>Сокровище карнавала: 15 сетов</h3>
<figure><img src="${CDN}/videos/dota_react/darkcarnival/treasure/set_io.png"/><figcaption>Io — Madame Scrio, самый редкий сет</figcaption></figure>
<table bordered striped compact>
<tr><th>Герой</th><th>Сет</th></tr>
${SETS.map(([hero, set]) => `<tr><td>${hero}</td><td>${set}</td></tr>`).join('\n')}
</table>
<h4>Цены Valve</h4>
<table striped compact>
<tr><td>Персоны-автоматоны</td><td align="right">$14.99</td></tr>
<tr><td>Secret Room Pack</td><td align="right">$14.99</td></tr>
</table>
${more('https://www.dota2.com/darkcarnival')}`;

// A news post: the announcement of 7.41e and Summer Scrub.
const NEWS = `<h3>7.41e и Summer Scrub</h3>
<p>The International всё ближе, и Valve выкатила обновление к нему:</p>
<ul>
<li>прогнозы и фэнтези;</li>
<li>наборы поддержки команд;</li>
<li><b>Summer Scrub</b>: докажи скилл и получи новые Immortal-предметы и ландшафты.</li>
</ul>
<p>Баланс — в отдельном посте про 7.41e.</p>
${more('https://www.dota2.com/newsentry/1839676055886687')}`;

// A find in the game files (build 6962: Primal Beast's new effect slots), the diff retold in Russian.
const DIFF = `- Слот 6: облик героя
+ Слот 6: эффекты Trample
+ Слот 7: эффекты Uproar
+ Слот 8: эффекты Rock Throw
+ Слот 9: эффекты Pulverize
+ Слот 10: эффекты Colossal
+ Слот 11: облик героя`;
const DATAMINE_TEXT =
  'В файлах игры нашли: у Primal Beast появились отдельные слоты эффектов для Trample, Uproar, Rock Throw, Pulverize и Colossal. Похоже на кастомные эффекты способностей. Valve не подтверждала, может измениться.';
const DATAMINE = `<h4>Нашли в файлах игры</h4>
<p>${DATAMINE_TEXT}</p>
<pre><code class="language-diff">${DIFF}</code></pre>`;
const DATAMINE_CLASSIC = `<b>Нашли в файлах игры</b>

${DATAMINE_TEXT}

<pre><code class="language-diff">${DIFF}</code></pre>`;

// The daily report when DEV has none released yet: the numbers only show the layout.
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

const REPORT_ID = 'daily-report';

// The stored report, read only as far as the sample needs; an older or damaged one falls back to the layout sample.
const storedReportSchema = z.object({
  daily: z.object({
    asOf: z.number(),
    platforms: z.array(
      z.object({
        platform: z.enum(['youtube', 'tiktok']),
        rows: z.array(
          z.object({
            title: z.string(),
            publishedAt: z.number(),
            views: z.number().nullable(),
            growth: z.object({ views: z.number().nullable() }),
            likesRate: z.number().nullable().optional(),
            sharesRate: z.number().nullable().optional(),
            trend: z.string().optional()
          })
        )
      })
    )
  })
});
const storedReviewSchema = z.object({ main: z.string(), points: z.array(z.object({ text: z.string() })) });
const PLATFORM = { youtube: 'YouTube', tiktok: 'TikTok' } as const;
const TREND: Record<string, string> = {
  new: 'новый',
  growing: 'растёт',
  slowing: 'замедляется',
  long_tail: 'длинный хвост',
  slow: 'медленно',
  weak: 'слабо',
  unknown: '—'
};
const ROWS_MAX = 15;
const TITLE_MAX = 40;

function count(value: number | null): string {
  if (value === null) return '—';
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}к`;
  return String(value);
}

function shortTitle(title: string): string {
  const chars = Array.from(title.replace(/\s+/g, ' ').trim());
  return chars.length <= TITLE_MAX ? chars.join('') : `${chars.slice(0, TITLE_MAX - 1).join('')}…`;
}

function parsedReview(raw: string | null): z.infer<typeof storedReviewSchema> | null {
  if (raw === null) return null;
  try {
    const parsed = storedReviewSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The newest released daily report (its stored numbers and review, no AI call) as rich tables; null when none. */
export async function latestDailyReport(container: Container): Promise<string | null> {
  const day = (await listReports(container.contentDailyReports, undefined)).items.find((each) => each.kind === 'day');
  const row = day === undefined ? null : await container.contentDailyReports.find(day.id);
  if (row === null) return null;
  const data = storedReportSchema.safeParse(JSON.parse(row.data));
  if (!data.success) return null;
  const review = parsedReview(row.review);
  const date = new Intl.DateTimeFormat('ru-RU', { timeZone: row.timezone, day: 'numeric', month: 'long' }).format(
    new Date(data.data.daily.asOf)
  );
  const parts = [`<h3>📈 Аналитика · ${date}</h3>`];
  if (review !== null) parts.push(`<p>${escapeHtml(review.main)}</p>`);
  for (const platform of data.data.daily.platforms) {
    if (platform.rows.length === 0) continue;
    const tiktok = platform.platform === 'tiktok';
    const rows = [...platform.rows]
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .slice(0, ROWS_MAX)
      .map((video) => {
        const share = tiktok ? video.sharesRate : video.likesRate;
        const cells = [
          `<td>${escapeHtml(shortTitle(video.title))}</td>`,
          `<td align="right">${count(video.views)}</td>`,
          `<td align="right">${video.growth.views === null ? '—' : `+${count(video.growth.views)}`}</td>`,
          `<td align="right">${share === null || share === undefined ? '—' : `${share.toFixed(1)}%`}</td>`,
          `<td>${TREND[video.trend ?? 'unknown'] ?? '—'}</td>`
        ];
        return `<tr>${cells.join('')}</tr>`;
      });
    parts.push(
      `<table bordered striped compact><caption>${PLATFORM[platform.platform]}</caption>`,
      `<tr><th>Ролик</th><th>Просмотры</th><th>За сутки</th><th>${tiktok ? 'Репосты' : 'Лайки'}</th><th>Статус</th></tr>`,
      ...rows,
      '</table>'
    );
  }
  if (review !== null && review.points.length > 0) {
    const points = review.points.map((point) => `<li>${escapeHtml(point.text)}</li>`).join('');
    parts.push(`<details><summary>🧠 Выводы</summary><ol>${points}</ol></details>`);
  }
  return parts.join('\n');
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const SAMPLES: Sample[] = [
  { title: 'Патч 7.41f', targets: ['channel', 'owner'], html: PATCH },
  { title: 'Ивент: The Dark Carnival', targets: ['channel', 'owner'], html: EVENT },
  { title: 'Сокровище: сеты', targets: ['channel', 'owner'], html: TREASURE },
  { title: 'Новость: 7.41e и Summer Scrub', targets: ['channel', 'owner'], html: NEWS },
  { title: 'Файлы игры (rich)', targets: ['channel', 'owner'], html: DATAMINE },
  { title: 'Файлы игры (обычный pre)', targets: ['channel', 'owner'], classic: true, html: DATAMINE_CLASSIC },
  { title: 'Отчёт аналитики', targets: ['owner'], html: REPORT_ID }
];

function capped(bytes: Uint8Array): Uint8Array | null {
  return bytes.byteLength > 0 && bytes.byteLength <= UPLOAD_MAX_BYTES ? bytes : null;
}

async function fetchBytes(fetcher: typeof fetch, url: string): Promise<Uint8Array | null> {
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS) });
    return response.ok ? capped(new Uint8Array(await response.arrayBuffer())) : null;
  } catch {
    return null;
  }
}

/** The newest drawn patch picture (`patch-<id>.jpg`) in the studio's library, or null. */
export async function latestPatchCover(container: Container): Promise<Uint8Array | null> {
  const storage = container.mediaStorage;
  if (storage === undefined) return null;
  const { items } = await container.postMedia.listLibrary({ kind: 'photo', search: 'patch-', usage: 'all', limit: 1 });
  const item = items[0];
  if (item === undefined) return null;
  const key = (await container.postMedia.findObjectKeys([item.id])).get(item.id);
  const object = key === undefined ? null : await storage.get(key);
  return object === null ? null : capped(new Uint8Array(await new Response(object.body).arrayBuffer()));
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
  patchCover: () => Promise<Uint8Array | null>;
  dailyReport: () => Promise<string | null>;
  channelChatId: string;
  ownerChatId: string;
  logger: Logger;
  requestId: string;
}): Promise<SendRichSamplesResponse> {
  const carnival = await fetchBytes(deps.fetch, CARNIVAL.url);
  const cover = await deps.patchCover().catch(() => null);
  const report = (await deps.dailyReport().catch(() => null)) ?? REPORT;
  const results: SendRichSamplesResponse['results'] = [];
  for (const sample of SAMPLES) {
    let html = sample.html === REPORT_ID ? report : sample.html;
    const uploads: { id: string; fileName: string; bytes: Uint8Array }[] = [];
    if (html.includes(`tg://photo?id=${CARNIVAL.id}`)) {
      if (carnival === null) html = html.replace(`tg://photo?id=${CARNIVAL.id}`, CARNIVAL.url);
      else uploads.push({ id: CARNIVAL.id, fileName: 'carnival-rewards.png', bytes: carnival });
    }
    if (html.includes(`tg://photo?id=${COVER_ID}`)) {
      if (cover === null) html = html.replace(`<figure><img src="tg://photo?id=${COVER_ID}"/></figure>\n`, '');
      else uploads.push({ id: COVER_ID, fileName: 'patch-cover.jpg', bytes: cover });
    }
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
