// Invented numbers and items for the Обзор prototype. Every figure from here is shown with a «демо» mark (UX_SPEC §3.1).
import { NOW, formatTime } from './data';
import { PULSE_MEDIA } from './media';
import { shortDate } from './preview-data';

/** Views and engagement per sent publication: no API yet, so they exist only in mock mode. */
export const DEMO_STATS: Record<string, { views: string; er: string }> = {
  u11: { views: '12.4K', er: '1.2%' },
  u12: { views: '8.2K', er: '0.6%' },
  u5: { views: '6.1K', er: '0.9%' },
  u6: { views: '15.3K', er: '2.1%' },
  u9: { views: '9.8K', er: '1.4%' }
};

/** Local midnight of the prototype's fixed «now»: «Сегодня» runs from here for 24 h. */
export const DAY_START = NOW - (12 * 60 + 40) * 60_000;

export const DEMO_TRENDS = { today: '+100%', sent: '+100%', attention: '−50%' } as const;

export const DEMO_SUBSCRIBERS = '12 456 подписчиков';

export type PulseItem = { id: string; title: string; summary: string; ago: string; image: string };
export const PULSE_ITEMS: PulseItem[] = [
  {
    id: 'pl1',
    title: 'Вышло обновление 7.37d',
    summary: 'Баланс героев, новые предметы и исправления.',
    ago: '2 ч назад',
    image: PULSE_MEDIA.patch
  },
  {
    id: 'pl2',
    title: 'Известны участники главного турнира',
    summary: 'Опубликован список приглашённых команд.',
    ago: '5 ч назад',
    image: PULSE_MEDIA.trophy
  },
  {
    id: 'pl3',
    title: 'Новый герой в разработке?',
    summary: 'Датамайнеры нашли упоминания в файлах игры.',
    ago: '8 ч назад',
    image: PULSE_MEDIA.hero
  }
];

export type AnalyticsTile = { label: string; value: string; trend: string; up: boolean; seed: number };
export const ANALYTICS_TILES: AnalyticsTile[] = [
  { label: 'Просмотры', value: '12.4K', trend: '229%', up: true, seed: 3 },
  { label: 'Подписчики', value: '+248', trend: '12%', up: true, seed: 5 },
  { label: 'Вовлечённость', value: '1.2%', trend: '0.4%', up: true, seed: 8 }
];

export type SystemRow = { id: 'bot' | 'telegram' | 'db' | 'queue'; name: string; latency: string };
export const SYSTEM_ROWS: SystemRow[] = [
  { id: 'bot', name: 'Бот публикаций', latency: '32 мс' },
  { id: 'telegram', name: 'Telegram API', latency: '48 мс' },
  { id: 'db', name: 'База данных', latency: '12 мс' },
  { id: 'queue', name: 'Очередь задач', latency: '5 мс' }
];

const WEEKDAYS_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
/** «Чт, 8 окт. 2026 · 12:40»: minute precision, owner's timezone (UTC+3). */
export const dateChipText = () => {
  const local = new Date(NOW + 3 * 3_600_000);
  return `${WEEKDAYS_SHORT[local.getUTCDay()]}, ${shortDate(NOW)} ${local.getUTCFullYear()} · ${formatTime(NOW)}`;
};

/** «Через 1 ч 55 мин» / «Завтра, 10:00» / «9 окт., 10:00». */
export const untilText = (at: number) => {
  const minutes = Math.max(0, Math.round((at - NOW) / 60_000));
  if (minutes < 60) return `Через ${minutes} мин`;
  const rest = minutes % 60;
  if (minutes < 24 * 60) return rest ? `Через ${Math.floor(minutes / 60)} ч ${rest} мин` : `Через ${minutes / 60} ч`;
  return minutes < 48 * 60 ? `Завтра, ${formatTime(at)}` : `${shortDate(at)}, ${formatTime(at)}`;
};

/** Reserved height of a phone card in Обзор lists: the tallest card (two-line title, thumb 44). */
export const PHONE_ROW = 96;
