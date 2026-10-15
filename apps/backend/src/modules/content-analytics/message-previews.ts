import type { Clock } from '../../platform/clock';
import {
  BELOW,
  count,
  type DigestData,
  type DigestEntry,
  digestAlert,
  digestData,
  digestTitle,
  forecastDay,
  type ItemAlertFacts,
  itemAlertText,
  itemTitle,
  lastWeekEnd,
  loadDigestInput,
  multiple,
  PLATFORM_LABEL,
  RISING,
  shortTime,
  signed,
  type SourceAlertFacts,
  sourceAlertText
} from './alerts';
import type { ContentAlertKind, ContentAlertRepository } from './d1-content-alerts-repository';
import type { ItemRow } from './d1-content-analytics-repository';
import type { ContentGoalRepository } from './goals';
import type { ContentPlatform } from './types';

// Every bot alert in each candidate style, for the owner to compare in the bot before one style is chosen
// (Настройки → Аналитика → «Прислать примеры в бота»). Built from last week's real numbers where they exist.

export type PreviewStyle = 'current' | 'card' | 'compact' | 'table';

const STYLE_NAME: Record<PreviewStyle, string> = {
  current: 'А · как сейчас',
  card: 'Б · карточка',
  compact: 'В · коротко',
  table: 'Г · таблица'
};

export interface MessagePreview {
  kind: ContentAlertKind;
  html: string;
  linkPath: string;
}

const ICON: Record<ContentPlatform, string> = { telegram: '✈️', youtube: '▶️', tiktok: '🎵' };

function esc(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/** Short enough for a monospace column on a phone: 950, 9 950, 12,4K, 1,2M. */
function short(value: number): string {
  const whole = Math.round(value);
  if (whole < 10_000) return count(whole);
  const [divisor, unit] = whole < 1_000_000 ? [1_000, 'K'] : [1_000_000, 'M'];
  return `${(Math.round((whole / divisor) * 10) / 10).toLocaleString('ru-RU')}${unit}`;
}

function percent(change: number): string {
  return change > 0 ? `+${change}%` : change < 0 ? `−${Math.abs(change)}%` : '0%';
}

function trend(change: number | null): string {
  if (change === null) return '';
  return change > 0 ? ` ▲ ${change}%` : change < 0 ? ` ▼ ${Math.abs(change)}%` : ' = 0%';
}

function bar(fraction: number): string {
  const filled = Math.max(0, Math.min(10, Math.round(fraction * 10)));
  return `${'▓'.repeat(filled)}${'░'.repeat(10 - filled)}`;
}

function footer(style: PreviewStyle): string {
  return `\n\n<i>— вариант ${STYLE_NAME[style]}</i>`;
}

function plain(title: string, body: string, style: PreviewStyle): string {
  return `<b>${esc(title)}</b>\n${esc(body)}${footer(style)}`;
}

// ---------- weekly digest ----------

function goalLines(data: DigestData, timezone: string, withBar: boolean): string[] {
  return data.goals.map((goal) => {
    const label = PLATFORM_LABEL[goal.platform];
    if (goal.reached) return `🎯 <b>Цель ${label}</b>: ${count(goal.target)} — достигнута 🎉`;
    const followers = goal.followers ?? 0;
    const pace = [
      goal.perWeek === null ? null : `${signed(goal.perWeek)} в неделю`,
      goal.forecastDay !== null
        ? `→ к ${forecastDay(goal.forecastDay, timezone)}`
        : goal.perWeek !== null && goal.perWeek <= 0
          ? 'рост стоит'
          : null
    ].filter((part) => part !== null);
    const head = `🎯 <b>Цель ${label}</b>: ${count(followers)} из ${count(goal.target)}`;
    const progress = `<code>${bar(followers / goal.target)}</code> ${Math.floor((followers / goal.target) * 100)}%`;
    return withBar
      ? `${head}\n${progress}${pace.length > 0 ? ` · ${pace.join(' ')}` : ''}`
      : `${head}${pace.length > 0 ? `, ${pace.join(' ')}` : ''}`;
  });
}

function entryLines(entries: readonly DigestEntry[]): string {
  return entries
    .map(
      (entry, index) =>
        `${index + 1}. <b>${multiple(entry.ratio)}</b> · ${ICON[entry.item.platform]} ${short(entry.item.views ?? 0)}\n${esc(itemTitle(entry.item, 60))}`
    )
    .join('\n');
}

function digestCard(data: DigestData, timezone: string): string {
  const blocks = [`📊 <b>${esc(digestTitle(data, timezone))}</b>`];
  blocks.push(
    data.published === 0
      ? '📝 За неделю публикаций не было.'
      : `📝 Публикаций: <b>${data.published}</b> <i>(неделей раньше ${data.publishedBefore})</i>`
  );
  if (data.atAge.length > 0)
    blocks.push(
      `👀 <b>Первые 24 часа</b>, обычно\n<blockquote>${data.atAge
        .map(
          (row) =>
            `${ICON[row.platform]} ${PLATFORM_LABEL[row.platform]} — <b>${count(row.views)}</b>${trend(row.change)}`
        )
        .join('\n')}</blockquote>`
    );
  if (data.followers.length > 0)
    blocks.push(
      `👥 <b>Подписчики</b>\n<blockquote>${data.followers
        .map(
          (row) =>
            `${ICON[row.platform]} ${PLATFORM_LABEL[row.platform]} — <b>${count(row.followers)}</b>${row.change === null ? '' : ` (${signed(row.change)})`}`
        )
        .join('\n')}</blockquote>`
    );
  blocks.push(...goalLines(data, timezone, true));
  if (data.best.length > 0)
    blocks.push(`🔥 <b>Лучшие недели</b>\n<blockquote expandable>${entryLines(data.best)}</blockquote>`);
  if (data.worst.length > 0)
    blocks.push(`🧊 <b>Слабее всего</b>\n<blockquote expandable>${entryLines(data.worst)}</blockquote>`);
  return blocks.join('\n\n') + footer('card');
}

function digestTable(data: DigestData, timezone: string): string {
  const head = `📊 <b>${esc(digestTitle(data, timezone))}</b>\nПубликаций <b>${data.published}</b> · неделей раньше ${data.publishedBefore}`;
  const platforms = [
    ...new Set([...data.atAge.map((row) => row.platform), ...data.followers.map((row) => row.platform)])
  ];
  const rows = platforms.map((platform) => {
    const age = data.atAge.find((row) => row.platform === platform);
    const fol = data.followers.find((row) => row.platform === platform);
    return [
      PLATFORM_LABEL[platform],
      age === undefined ? '—' : short(age.views),
      age?.change === null || age === undefined ? '' : percent(age.change),
      fol === undefined ? '—' : short(fol.followers),
      fol?.change === null || fol === undefined ? '' : signed(fol.change)
    ];
  });
  // Monospace columns: names left-aligned, numbers right-aligned; ~32 characters fit a phone screen.
  const header = ['', '24 ч', '', 'Подп.', ''];
  const widths = header.map((_, column) => Math.max(...[header, ...rows].map((row) => row[column]!.length)));
  const format = (row: readonly string[]) =>
    row
      .map((cell, column) => (column === 0 ? cell.padEnd(widths[column]!) : cell.padStart(widths[column]!)))
      .join(' ')
      .trimEnd();
  const blocks = [head];
  if (rows.length > 0) blocks.push(`<pre>${esc([format(header), ...rows.map(format)].join('\n'))}</pre>`);
  blocks.push(...goalLines(data, timezone, true));
  const ranked = (title: string, entries: readonly DigestEntry[]) =>
    `<b>${title}</b>\n${entries
      .map(
        (entry) =>
          `<code>${multiple(entry.ratio).padStart(4)}</code> ${ICON[entry.item.platform]} ${esc(itemTitle(entry.item, 40))}`
      )
      .join('\n')}`;
  if (data.best.length > 0) blocks.push(ranked('🔥 Лучшие', data.best));
  if (data.worst.length > 0) blocks.push(ranked('🧊 Слабее всего', data.worst));
  return blocks.join('\n\n') + footer('table');
}

function digestCompact(data: DigestData, timezone: string, plainBody: string): string {
  const followers = data.followers.reduce((sum, row) => sum + (row.change ?? 0), 0);
  const strongest = [...data.atAge]
    .filter((row) => row.change !== null)
    .sort((a, b) => Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0))[0];
  const headline = [
    strongest === undefined
      ? `${data.published} публикаций`
      : `${PLATFORM_LABEL[strongest.platform]} ${percent(strongest.change ?? 0)}`,
    data.followers.length === 0 ? null : `подписчиков ${signed(followers)}`
  ]
    .filter((part) => part !== null)
    .join(', ');
  const top = data.best[0];
  const lines = [`📊 <b>Неделя: ${esc(headline)}</b>`];
  if (top !== undefined)
    lines.push(`Лучший — «${esc(itemTitle(top.item, 50))}», <b>${multiple(top.ratio)}</b> обычного.`);
  lines.push(`<blockquote expandable>${esc(plainBody)}</blockquote>`);
  return lines.join('\n') + footer('compact');
}

// ---------- item and source alerts ----------

function itemPreviews(facts: ItemAlertFacts): MessagePreview[] {
  const rising = facts.direction === 'rising';
  const text = itemAlertText(facts);
  const title = esc(itemTitle(facts.item, 80));
  const label = `${ICON[facts.item.platform]} ${PLATFORM_LABEL[facts.item.platform]}`;
  const ratio = multiple(facts.views / facts.usual);
  const advice = rising
    ? 'Повторите тему или первую фразу, пока интерес высокий.'
    : 'Проверьте первую строку, обложку и время выхода.';
  const card = [
    `${rising ? '🚀' : '🐢'} <b>${rising ? 'Залетает' : 'Идёт слабее обычного'}</b> · ${label}`,
    `«${title}»`,
    '',
    `<b>${ratio}</b> обычного за ${facts.hours} ч`,
    `<blockquote>👀 ${count(facts.views)} просмотров\n📈 обычно ${count(facts.usual)}</blockquote>`,
    `💡 <i>${advice}</i>`
  ].join('\n');
  const compact = [
    `${rising ? '🚀' : '🐢'} <b>${ratio}</b> · ${label} · ${facts.hours} ч`,
    `«${title}»`,
    `<code>${count(facts.views)}</code> просмотров при обычных <code>${count(facts.usual)}</code>`
  ].join('\n');
  const linkPath = `/analytics?id=${encodeURIComponent(facts.item.id)}`;
  return [
    { kind: 'item', html: plain(text.title, text.body, 'current'), linkPath },
    { kind: 'item', html: card + footer('card'), linkPath },
    { kind: 'item', html: compact + footer('compact'), linkPath }
  ];
}

function sourcePreviews(facts: SourceAlertFacts, timezone: string): MessagePreview[] {
  const text = sourceAlertText(facts, timezone);
  const label = PLATFORM_LABEL[facts.platform];
  const reconnect = facts.lastErrorCode === 'TIKTOK_RECONNECT';
  const when = shortTime(facts.lastSuccessAt, timezone);
  const card = reconnect
    ? `🔑 <b>${label}: нужно войти заново</b>\n\n${label} отозвал доступ — статистика не обновляется.\n👉 <i>Настройки → Аналитика</i>`
    : `⚠️ <b>${label}: сбор статистики остановлен</b>\n<blockquote>Последний успешный сбор: ${esc(when)}\nОшибка: <code>${esc(facts.lastErrorCode ?? 'неизвестна')}</code></blockquote>\nГрафики не обновляются, повторяем каждые 15 минут.`;
  const compact = reconnect
    ? `🔑 <b>${label}</b>: доступ отозван, войдите заново`
    : `⚠️ <b>${label}</b> не собирается с ${esc(when)} · <code>${esc(facts.lastErrorCode ?? '—')}</code>`;
  const linkPath = '/settings/analytics';
  return [
    { kind: 'source', html: plain(text.title, text.body, 'current'), linkPath },
    { kind: 'source', html: card + footer('card'), linkPath },
    { kind: 'source', html: compact + footer('compact'), linkPath }
  ];
}

const SAMPLE_ITEM: ItemRow = {
  id: 'tiktok:sample',
  platform: 'tiktok',
  title: 'Пудж через мид в 7.38 — это законно?',
  url: '',
  thumbnailUrl: null,
  publishedAt: 0,
  views: 7_200,
  likes: null,
  comments: null,
  shares: null,
  observedAt: 0
};

/**
 * The preview set: an intro, then each alert kind in every style. Last week's digest is real; the item
 * alerts use last week's best and weakest publication when there are any, and the source alerts are samples.
 * Bounded: four reads, 17 messages with the intro.
 */
export async function buildMessagePreviews(deps: {
  repo: ContentAlertRepository;
  goals: ContentGoalRepository;
  clock: Clock;
  timezone: string;
}): Promise<{ intro: string; messages: MessagePreview[] }> {
  const now = deps.clock.now();
  const input = await loadDigestInput({ ...deps, weekEnd: lastWeekEnd(now, deps.timezone) });
  const data = digestData(input);
  const current = digestAlert(input);

  // A real publication only when it would really raise that alert; otherwise a sample.
  const best = data.best.find((entry) => entry.ratio >= RISING);
  const worst = [...data.worst, ...data.best].find((entry) => entry.ratio <= BELOW);
  const rising: ItemAlertFacts =
    best === undefined
      ? { item: SAMPLE_ITEM, direction: 'rising', hours: 6, views: 7_200, usual: 4_000 }
      : {
          item: best.item,
          direction: 'rising',
          hours: 24,
          views: best.item.views ?? 0,
          usual: Math.max(1, Math.round((best.item.views ?? 0) / best.ratio))
        };
  const below: ItemAlertFacts =
    worst === undefined
      ? { item: SAMPLE_ITEM, direction: 'below', hours: 6, views: 1_900, usual: 4_000 }
      : {
          item: worst.item,
          direction: 'below',
          hours: 24,
          views: worst.item.views ?? 0,
          usual: Math.max(1, Math.round((worst.item.views ?? 0) / worst.ratio))
        };

  const digest: MessagePreview[] = [
    { kind: 'digest', html: plain(current.title, current.body, 'current'), linkPath: '/analytics' },
    { kind: 'digest', html: digestCard(data, deps.timezone), linkPath: '/analytics' },
    { kind: 'digest', html: digestCompact(data, deps.timezone, current.body), linkPath: '/analytics' },
    { kind: 'digest', html: digestTable(data, deps.timezone), linkPath: '/analytics' }
  ];
  const messages = [
    ...digest,
    ...itemPreviews(rising),
    ...itemPreviews(below),
    ...sourcePreviews(
      { platform: 'youtube', lastSuccessAt: now - 4 * 60 * 60 * 1000, lastErrorCode: 'YOUTUBE_QUOTA' },
      deps.timezone
    ),
    ...sourcePreviews({ platform: 'tiktok', lastSuccessAt: now, lastErrorCode: 'TIKTOK_RECONNECT' }, deps.timezone)
  ];
  const intro = [
    '🧪 <b>Примеры сообщений бота</b>',
    '',
    'Дальше идут все виды оповещений, каждый в нескольких стилях:',
    '• сводка недели (настоящие цифры прошлой недели) — А, Б, В, Г',
    '• «Залетает» и «Идёт слабее обычного» — А, Б, В',
    '• сбор статистики сломался и «нужно войти заново» — А, Б, В',
    '',
    'Внизу каждого сообщения подписан вариант. Напишите, какой стиль оставить.'
  ].join('\n');
  return { intro, messages };
}
