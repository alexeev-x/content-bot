import type { SendRichSamplesResponse } from '@alexeev/contracts';
import { GrammyError } from 'grammy';
import { z } from 'zod';
import { listReports } from '../../modules/content-analytics';
import type { TelegramRichMessageApi } from '../../integrations/telegram/telegram-api';
import type { Logger } from '../../platform/logging/logger';
import type { Container } from '../container';

// The DEV look at Telegram rich messages (Bot API 10.1–10.3) before any post is rebuilt (owner, 23.10.2026): every
// kind of channel post and both analytics reports. The texts are the AI writer's drafts on DEV, the facts of Valve's
// announcements and Liquipedia, and the reports DEV released; nothing calls the AI. The owner's rules (23.10.2026):
// one picture per post, no English text but names, no source line, only «Подробнее» to dota2.com.

const SEND_TIMEOUT_MS = 10_000;
const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const ERROR_MAX = 300;

const CDN = 'https://cdn.steamstatic.com/apps/dota2';
const CARNIVAL_PAGE = 'https://www.dota2.com/darkcarnival';
const TROVE_PAGE = 'https://www.dota2.com/newsentry/681888927386174386';
// The newest patch picture from the studio's library, uploaded (`tg://photo?id=`) as our R2 pictures would go.
const COVER_ID = 'patch_cover';
const COVER_FIGURE = `<figure><img src="tg://photo?id=${COVER_ID}"/></figure>\n`;
// The reports are read when the button is pressed; these mark where they go.
const DAILY = 'daily-report';
const WEEKLY = 'weekly-report';

type Target = 'channel' | 'owner';
type Sample = { title: string; targets: Target[]; classic?: boolean; html: string };

const more = (url: string) => `<tg-button-row><tg-button type="url" url="${url}">Подробнее</tg-button></tg-button-row>`;
const picture = (url: string) => `<figure><img src="${url}"/></figure>`;

// A big patch: the AI writer's 7.41f post of 22.10.2026 with a heading, a mark, a table and a folded block.
const PATCH = `<h3>Вышел 7.41f</h3>
${COVER_FIGURE}<p>Главное: <mark>Тренту порезали базовый интеллект</mark>, инвиз после выхода из деревьев держится вдвое меньше, а талант на усиление лечения Living Armor заменили на +3 секунды действия.</p>
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

// A hotfix worth a post: «Dota 2 Update - 7/1/2026» (event rewards a player cares about), the rest folded.
const HOTFIX = `<h3>Обновление 1 июля: карнавал щедрее</h3>
<p>Valve выпустила мелкий фикс, но для «Тёмного карнавала» он важный:</p>
<ul>
<li>за обычные игры теперь дают <mark>2 металлолома, за турбо — 1</mark>, даже при поражении. 6 металлолома меняются на билет любого героя;</li>
<li>Seeing Stones теперь можно получить в коопе с ботами на сложности Hard и Unfair;</li>
<li>в Candyworks видно, есть ли у тебя уже предложенный предмет.</li>
</ul>
<details><summary>Остальные исправления</summary><ul>
<li>Для ранкеда по ролям в соло теперь хватает одной востребованной роли</li>
<li>Билеты карнавала снова дают за Ability Draft и игры с ботами</li>
<li>Пироги карнавала больше не выдают, где настоящий герой, а где иллюзия</li>
<li>Ironwood Nut больше не даёт некоторым героям не тот основной атрибут</li>
</ul></details>
${more('https://www.dota2.com/newsentry/670621050832160174')}`;

// The event series (owner, 22.10.2026: three posts on fixed topics): the AI writer's three Dark Carnival posts.
const SERIES_EVENT = `<h3>«Тёмный карнавал»: побег из поезда и награды</h3>
${picture(`${CDN}/images/dota_react/darkcarnival/overworld/dark_carnival_overworld_poster.jpg`)}
<p>В Доте вышел «Тёмный карнавал»: надо сбежать из пауконогого поезда Магистра. Основной сюжет бесплатный. Играешь в Доту, получаешь билеты в зависимости от выбранного героя и открываешь путь по вагонам.</p>
<p>Главная приманка по дороге: <mark>четыре набора для Phantom Assassin, Crystal Maiden, Invoker и Magnus</mark>. Получить их можно только через сюжет. Ещё вернулась лавка конфет, а десять монет можно обменять на скидку в магазине события.</p>
<p>За деньги отдельно продают «Комплект тайных комнат»: он открывает побочные истории с наградами, а крипов и музыку даёт сразу. Для основного побега покупать его не надо))</p>
<p><i>Дальше ещё два поста с подробностями</i></p>
${more(CARNIVAL_PAGE)}`;

const SERIES_COSMETICS = `<h3>Пять личностей-автоматонов</h3>
${picture(`${CDN}/images/dota_react/darkcarnival/automatons/axe/axe_automaton_idle_poster.png`)}
<p>Морф теперь из стали, а брист перешёл на машинное масло. Причём бристу сойдёт и отработка, если уж наливают))</p>
<table bordered striped compact>
<tr><th>Герой</th><th>Какой он теперь</th></tr>
<tr><td>Axe</td><td>чуть не расплавили: собрали двигатель ярости, а он хочет убить вообще всё</td></tr>
<tr><td>Legion Commander</td><td>роботизированный сапог, чтобы давить врагов каблуком и пореже останавливаться</td></tr>
<tr><td>Oracle</td><td>заводной пророк: будущее видит, изменить не может, а слушать его никто не хочет</td></tr>
<tr><td>Morphling</td><td>теперь из стали</td></tr>
<tr><td>Bristleback</td><td>перешёл на машинное масло</td></tr>
</table>
<p>И тут переделали не одну внешность. У каждого из пяти новые анимации, уникальные эффекты и иконки, плюс изменённая обработка голоса. Даже звучать эта пятёрка будет по-другому</p>
${more(CARNIVAL_PAGE)}`;

// The carnival treasure's sets in the event page's order, from common to the rarest (dota2.com/darkcarnival).
const CARNIVAL_SETS: [string, string][] = [
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
  ['Pudge', 'The Woodcutter (с личностью)'],
  ['Primal Beast', 'Mane Attraction'],
  ['Mirana', 'Selemene Showgirl'],
  ['Dark Willow', 'Fairy Godmummer'],
  ['Io', '<mark>Madame Scrio</mark> — самая редкая']
];
const SERIES_TREASURE = `<h3>Treasure of Wonders: Io и карнавальные сеты</h3>
${picture(`${CDN}/videos/dota_react/darkcarnival/treasure/set_io.png`)}
<p>Самая редкая награда Treasure of Wonders досталась шару: Io в наборе Madame Scrio. Всего в сокровищнице 15 карнавальных сетов. У Пуджа тут The Woodcutter, причём личность к нему прилагается.</p>
<table bordered striped compact>
<tr><th>Герой</th><th>Сет</th></tr>
${CARNIVAL_SETS.map(([hero, set]) => `<tr><td>${hero}</td><td>${set}</td></tr>`).join('\n')}
</table>
<p>Что интереснее, шар или Пудж с личностью?</p>
${more(CARNIVAL_PAGE)}`;

// A treasure without its own page: the AI writer's Trove of Terror news, then its two follow-ups (sets, details).
const TROVE_NEWS = `<h3>Trove of Terror</h3>
${picture('https://clan.akamai.steamstatic.com/images/3703047/44e04da47da8b634dee235756e4ffa1234879b40.png')}
<p>Габен вернул аркану на дровку и добавил новую на тайда. Обе в новой сокровищнице Trove of Terror, которая уже вышла в Доте.</p>
<p>Внутри 15 Immortal-сетов в духе потусторонних кошмаров. У дровки есть прежний облик и новый мрачный вариант.</p>
<p>Тайду досталась <mark>Maw of the Megalodon</mark>: новая модель, анимации, эффекты, насмешки и реплики. Всего три акульих облика, которые предстоит открыть.</p>
<p>За открытие определённого количества сокровищниц гарантированно дадут новый облик Терзателя, а за ещё большее количество — Рошана.</p>
${more(TROVE_PAGE)}`;

const TROVE_SETS = `<h3>Trove of Terror: все сеты и цена</h3>
<p>Сокровищница стоит <mark>$4.99</mark>. Шанс на редкие растёт с каждым открытием и сбрасывается, когда предмет выпал.</p>
<table bordered striped compact>
<tr><th>Редкость</th><th>Сеты</th></tr>
<tr><td>Обычные</td><td>Stoneback Sovereign, Patchwork Protector, Creeping Calabash, Rictus Ripper, Clairvoyant Configuration, Slobbering Strongbox, Shattered Sanity, Arachnid Anathema, Daemon Hunter, Direstone Desecration, Greasepaint Gutbuster, Silken Sibyl</td></tr>
<tr><td>Редкие</td><td>Curse of the Wyrmbender, Mesmer-Eye</td></tr>
<tr><td>Очень редкий</td><td>Hell's Legion</td></tr>
<tr><td>Ультраредкие</td><td>Sepulchral Stalker, Maw of the Megalodon</td></tr>
</table>
${more(TROVE_PAGE)}`;

const TROVE_DETAILS = `<h3>Trove of Terror: шансы и бонусы</h3>
<p>Бонусы за открытия: <b>12</b> сокровищниц — Obscene Eye Ball, <b>40</b> — R'shan the Eternal и Baby R'shan the Eternal.</p>
<table bordered striped compact>
<caption>Шанс на N-м открытии</caption>
<tr><th>Открытие</th><th align="right">Редкий</th><th align="right">Очень редкий</th><th align="right">Ультраредкий</th></tr>
<tr><td>1-е</td><td align="right">0.05%</td><td align="right">0.005%</td><td align="right">0.001%</td></tr>
<tr><td>10-е</td><td align="right">9.61%</td><td align="right">1.78%</td><td align="right">0.17%</td></tr>
<tr><td>20-е</td><td align="right">38.46%</td><td align="right">7.87%</td><td align="right">0.95%</td></tr>
<tr><td>30-е</td><td align="right">71.42%</td><td align="right">16.66%</td><td align="right">2.17%</td></tr>
<tr><td>40-е</td><td align="right">100%</td><td align="right">30.30%</td><td align="right">3.84%</td></tr>
<tr><td>50-е</td><td align="right">100%</td><td align="right">45.45%</td><td align="right"><mark>100%</mark></td></tr>
</table>
<p>Если за 50 открытий ультраредкий не выпал, на 50-м он гарантирован.</p>
${more(TROVE_PAGE)}`;

// A news post that is neither a patch nor an event: the announcement of 7.41e and Summer Scrub.
const NEWS = `<h3>7.41e и Summer Scrub</h3>
<p>The International всё ближе, и Valve выкатила обновление к нему:</p>
<ul>
<li>прогнозы и фэнтези;</li>
<li>наборы поддержки команд;</li>
<li><b>Summer Scrub</b>: докажи скилл и получи новые Immortal-предметы и ландшафты.</li>
</ul>
<p>Баланс — в отдельном посте про 7.41e.</p>
${more('https://www.dota2.com/newsentry/678505520073540065')}`;

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

const BOTH: Target[] = ['channel', 'owner'];
const SAMPLES: Sample[] = [
  { title: 'Патч 7.41f', targets: BOTH, html: PATCH },
  { title: 'Хотфикс 1 июля', targets: BOTH, html: HOTFIX },
  { title: 'Серия ивента 1/3', targets: BOTH, html: SERIES_EVENT },
  { title: 'Серия ивента 2/3', targets: BOTH, html: SERIES_COSMETICS },
  { title: 'Серия ивента 3/3', targets: BOTH, html: SERIES_TREASURE },
  { title: 'Сокровище: новость', targets: BOTH, html: TROVE_NEWS },
  { title: 'Сокровище: сеты', targets: BOTH, html: TROVE_SETS },
  { title: 'Сокровище: детали', targets: BOTH, html: TROVE_DETAILS },
  { title: 'Новость', targets: BOTH, html: NEWS },
  { title: 'Файлы игры (rich)', targets: BOTH, html: DATAMINE },
  { title: 'Файлы игры (обычный pre)', targets: BOTH, classic: true, html: DATAMINE_CLASSIC },
  { title: 'Отчёт за день', targets: ['owner'], html: DAILY },
  { title: 'Отчёт за неделю', targets: ['owner'], html: WEEKLY }
];

// The stored reports, read only as far as the samples need; an older or damaged one counts as none.
const reviewSchema = z.object({ main: z.string(), points: z.array(z.object({ text: z.string() })) });
const platformSchema = z.enum(['youtube', 'tiktok', 'telegram']);
const dailySchema = z.object({
  daily: z.object({
    asOf: z.number(),
    platforms: z.array(
      z.object({
        platform: platformSchema,
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
const weeklySchema = z.object({
  kind: z.literal('weekly'),
  weekStart: z.number(),
  weekEnd: z.number(),
  published: z.number(),
  publishedBefore: z.number(),
  followers: z.array(z.object({ platform: platformSchema, followers: z.number(), change: z.number().nullable() })),
  goals: z.array(z.object({ platform: platformSchema, target: z.number(), followers: z.number() })),
  videos: z.array(
    z.object({
      title: z.string(),
      cells: z.array(
        z.object({
          platform: platformSchema,
          views: z.number().nullable(),
          likesRate: z.number().nullable().optional()
        })
      )
    })
  ),
  posts: z.array(z.object({ title: z.string(), views: z.number().nullable() }))
});
const PLATFORM = { youtube: 'YouTube', tiktok: 'TikTok', telegram: 'Telegram' } as const;
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

function count(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(Math.abs(value) >= 10_000 ? 0 : 1)}к`;
  return String(value);
}

const signed = (value: number) => `${value > 0 ? '+' : ''}${count(value)}`;
const percent = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : `${value.toFixed(1)}%`;

function shortTitle(title: string): string {
  const chars = Array.from(title.replace(/\s+/g, ' ').trim());
  return escapeHtml(chars.length <= TITLE_MAX ? chars.join('') : `${chars.slice(0, TITLE_MAX - 1).join('')}…`);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function parsedJson<T>(raw: string | null, schema: z.ZodType<T>): T | null {
  if (raw === null) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function reviewParts(review: z.infer<typeof reviewSchema> | null): { lead: string[]; tail: string[] } {
  if (review === null) return { lead: [], tail: [] };
  const points = review.points.map((point) => `<li>${escapeHtml(point.text)}</li>`).join('');
  return {
    lead: [`<p>${escapeHtml(review.main)}</p>`],
    tail: points === '' ? [] : [`<details><summary>🧠 Выводы</summary><ol>${points}</ol></details>`]
  };
}

const dayOf = (at: number, timezone: string) =>
  new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, day: 'numeric', month: 'long' }).format(new Date(at));

function dailyHtml(data: z.infer<typeof dailySchema>, timezone: string, review: z.infer<typeof reviewSchema> | null) {
  const { lead, tail } = reviewParts(review);
  const parts = [`<h3>📈 Аналитика · ${dayOf(data.daily.asOf, timezone)}</h3>`, ...lead];
  for (const platform of data.daily.platforms) {
    if (platform.rows.length === 0) continue;
    const tiktok = platform.platform === 'tiktok';
    const rows = [...platform.rows]
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .slice(0, ROWS_MAX)
      .map((video) => {
        const cells = [
          `<td>${shortTitle(video.title)}</td>`,
          `<td align="right">${count(video.views)}</td>`,
          `<td align="right">${video.growth.views === null ? '—' : signed(video.growth.views)}</td>`,
          `<td align="right">${percent(tiktok ? video.sharesRate : video.likesRate)}</td>`,
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
  return [...parts, ...tail].join('\n');
}

function weeklyHtml(data: z.infer<typeof weeklySchema>, timezone: string, review: z.infer<typeof reviewSchema> | null) {
  const { lead, tail } = reviewParts(review);
  const parts = [
    `<h3>📈 Итоги недели · ${dayOf(data.weekStart, timezone)} — ${dayOf(data.weekEnd - 1, timezone)}</h3>`,
    ...lead,
    `<p>Публикаций: <b>${data.published}</b> (неделей раньше ${data.publishedBefore})</p>`
  ];
  if (data.followers.length > 0 || data.goals.length > 0) {
    const goalOf = (platform: string) => data.goals.find((goal) => goal.platform === platform);
    parts.push(
      '<table bordered striped compact><caption>Подписчики</caption>',
      '<tr><th>Площадка</th><th align="right">Сейчас</th><th align="right">За неделю</th><th align="right">Цель</th></tr>',
      ...data.followers.map((row) => {
        const goal = goalOf(row.platform);
        const target =
          goal === undefined
            ? '—'
            : `${count(goal.target)} (${Math.min(100, Math.floor((goal.followers / goal.target) * 100))}%)`;
        return `<tr><td>${PLATFORM[row.platform]}</td><td align="right">${count(row.followers)}</td><td align="right">${row.change === null ? '—' : signed(row.change)}</td><td align="right">${target}</td></tr>`;
      }),
      '</table>'
    );
  }
  if (data.videos.length > 0) {
    const views = (cells: (typeof data.videos)[number]['cells'], platform: 'youtube' | 'tiktok') =>
      count(cells.find((cell) => cell.platform === platform)?.views);
    parts.push(
      '<table bordered striped compact><caption>Ролики недели</caption>',
      '<tr><th>Ролик</th><th align="right">YouTube</th><th align="right">TikTok</th></tr>',
      ...data.videos
        .slice(0, ROWS_MAX)
        .map(
          (video) =>
            `<tr><td>${shortTitle(video.title)}</td><td align="right">${views(video.cells, 'youtube')}</td><td align="right">${views(video.cells, 'tiktok')}</td></tr>`
        ),
      '</table>'
    );
  }
  if (data.posts.length > 0)
    parts.push(
      '<table bordered striped compact><caption>Посты в Telegram</caption>',
      '<tr><th>Пост</th><th align="right">Просмотры</th></tr>',
      ...data.posts
        .slice(0, ROWS_MAX)
        .map((post) => `<tr><td>${shortTitle(post.title)}</td><td align="right">${count(post.views)}</td></tr>`),
      '</table>'
    );
  return [...parts, ...tail].join('\n');
}

/**
 * The newest released daily and weekly reports (their stored numbers and review, no AI call) as rich tables; null
 * for a kind DEV has not released yet.
 */
export async function latestReports(container: Container): Promise<{ daily: string | null; weekly: string | null }> {
  const { items } = await listReports(container.contentDailyReports, undefined);
  const day = items.find((each) => each.kind === 'day');
  const week = items.find((each) => each.kind === 'week');
  const [dayRow, weekRow] = await Promise.all([
    day === undefined ? null : container.contentDailyReports.find(day.id),
    week === undefined ? null : container.contentDailyReports.find(week.id)
  ]);
  const daily = dayRow === null ? null : parsedJson(dayRow.data, dailySchema);
  const weekly = weekRow === null ? null : parsedJson(weekRow.data, weeklySchema);
  return {
    daily:
      dayRow === null || daily === null
        ? null
        : dailyHtml(daily, dayRow.timezone, parsedJson(dayRow.review, reviewSchema)),
    weekly:
      weekRow === null || weekly === null
        ? null
        : weeklyHtml(weekly, weekRow.timezone, parsedJson(weekRow.review, reviewSchema))
  };
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
  if (object === null) return null;
  const bytes = new Uint8Array(await new Response(object.body).arrayBuffer());
  return bytes.byteLength > 0 && bytes.byteLength <= UPLOAD_MAX_BYTES ? bytes : null;
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
  patchCover: () => Promise<Uint8Array | null>;
  reports: () => Promise<{ daily: string | null; weekly: string | null }>;
  channelChatId: string;
  ownerChatId: string;
  logger: Logger;
  requestId: string;
}): Promise<SendRichSamplesResponse> {
  const cover = await deps.patchCover().catch(() => null);
  const reports = await deps.reports().catch(() => ({ daily: null, weekly: null }));
  const results: SendRichSamplesResponse['results'] = [];
  for (const sample of SAMPLES) {
    const html =
      sample.html === DAILY
        ? reports.daily
        : sample.html === WEEKLY
          ? reports.weekly
          : cover === null
            ? sample.html.replace(COVER_FIGURE, '')
            : sample.html;
    if (html === null) {
      for (const target of sample.targets)
        results.push({ sample: sample.title, target, status: 'failed', error: 'На DEV ещё нет такого отчёта' });
      continue;
    }
    const uploads =
      cover !== null && html.includes(`tg://photo?id=${COVER_ID}`)
        ? [{ id: COVER_ID, fileName: 'patch-cover.jpg', bytes: cover }]
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
