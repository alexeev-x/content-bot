// Invented data for the experimental previews (docs/design/UX_SPEC.md §6). Nothing here reaches a network.
import { NOW } from './data';
import type { StatusKey } from '../../shared/ui';

const HOUR = 3_600_000;
const OFFSET = 3 * HOUR; // Europe/Chisinau, UTC+3

/** Deterministic pseudo-random numbers: every screenshot and every visit shows the same demo. */
export function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const MONTH_NAMES = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь'
];
export const MONTH_GEN = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря'
];
export const monthShort = (month: number) => (MONTH_GEN[month] ?? '').slice(0, 3);
export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export const WEEKDAYS_LONG = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];

const pad = (value: number) => String(value).padStart(2, '0');

/** Local calendar day key `YYYY-MM-DD` of an instant. */
export const dayKeyOf = (ts: number) => new Date(ts + OFFSET).toISOString().slice(0, 10);
export const TODAY_KEY = dayKeyOf(NOW);
export const dateOfKey = (key: string) => new Date(`${key}T00:00:00Z`);
export const keyOfDate = (date: Date) => date.toISOString().slice(0, 10);
export const addDays = (key: string, days: number) => {
  const date = dateOfKey(key);
  date.setUTCDate(date.getUTCDate() + days);
  return keyOfDate(date);
};
export const addMonths = (key: string, months: number) => {
  const date = dateOfKey(key);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  return keyOfDate(date);
};
/** Monday-based weekday, 0..6. */
export const weekdayOf = (key: string) => (dateOfKey(key).getUTCDay() + 6) % 7;
export const startOfWeek = (key: string) => addDays(key, -weekdayOf(key));
export const dayNumber = (key: string) => dateOfKey(key).getUTCDate();
export const monthOfKey = (key: string) => dateOfKey(key).getUTCMonth();
export const longDay = (key: string) => `${dayNumber(key)} ${MONTH_GEN[monthOfKey(key)]}`;
export const timeOf = (ts: number) => {
  const date = new Date(ts + OFFSET);
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
};
export const hourOf = (ts: number) => new Date(ts + OFFSET).getUTCHours();
export const atLocal = (key: string, time: string) => {
  const [h, m] = time.split(':').map(Number) as [number, number];
  const date = dateOfKey(key);
  return date.getTime() + (h * 60 + m) * 60_000 - OFFSET;
};
export const shortDate = (ts: number) => `${dayNumber(dayKeyOf(ts))} ${monthShort(monthOfKey(dayKeyOf(ts)))}.`;
export const numberRu = (value: number) => value.toLocaleString('ru-RU').replace(/ /g, ' ');

// --- Календарь ------------------------------------------------------------------------------------------------

export type CalendarStatus = Extract<StatusKey, 'scheduled' | 'sent' | 'draft' | 'failed' | 'unknown'>;
export type CalendarItem = {
  id: string;
  title: string;
  at: number;
  status: CalendarStatus;
  channel: string;
  thumb: boolean;
};

const TITLES = [
  'Итоги недели в про-сцене',
  'Разбор драфта третьей карты',
  'Патч 7.37: что изменилось у героев',
  'Расписание группового этапа',
  'Гайд: ранняя игра на линии',
  'Новости о составах команд',
  'Интервью после финала квалификации',
  'Предметы, которые стали популярнее',
  'Вопросы недели от подписчиков',
  'Лучшие моменты уикенда',
  'Анонс стрима с разбором реплеев',
  'Календарь турниров на ноябрь',
  'Заметки по балансу героев поддержки',
  'Подборка клипов от сообщества'
];
const CHANNEL_NAMES = ['Dota Pulse', 'Тестовый канал', 'ALEXEEV Studio'];

// [month (1-based), day, time, title index, status]; one collision (12 окт. 14:30), one five-item day (15 окт.).
const CALENDAR_SPEC: ReadonlyArray<readonly [number, number, string, number, CalendarStatus]> = [
  [10, 1, '10:00', 0, 'sent'],
  [10, 2, '18:30', 3, 'sent'],
  [10, 3, '12:00', 7, 'sent'],
  [10, 5, '09:15', 1, 'sent'],
  [10, 6, '16:00', 5, 'sent'],
  [10, 7, '18:30', 2, 'unknown'],
  [10, 7, '21:00', 8, 'sent'],
  [10, 8, '08:00', 9, 'sent'],
  [10, 8, '14:30', 4, 'scheduled'],
  [10, 8, '19:00', 6, 'scheduled'],
  [10, 9, '11:00', 10, 'draft'],
  [10, 9, '20:15', 11, 'scheduled'],
  [10, 10, '10:30', 12, 'scheduled'],
  [10, 12, '14:30', 0, 'scheduled'],
  [10, 12, '14:30', 13, 'scheduled'],
  [10, 12, '19:00', 3, 'draft'],
  [10, 13, '12:00', 1, 'scheduled'],
  [10, 14, '09:30', 7, 'failed'],
  [10, 14, '17:45', 5, 'scheduled'],
  [10, 15, '09:00', 2, 'scheduled'],
  [10, 15, '11:30', 8, 'scheduled'],
  [10, 15, '14:00', 9, 'scheduled'],
  [10, 15, '17:00', 4, 'draft'],
  [10, 15, '20:00', 10, 'scheduled'],
  [10, 17, '13:00', 6, 'scheduled'],
  [10, 19, '10:00', 11, 'scheduled'],
  [10, 21, '18:00', 12, 'scheduled'],
  [10, 23, '12:30', 13, 'draft'],
  [10, 26, '10:00', 0, 'scheduled'],
  [10, 29, '16:30', 3, 'scheduled'],
  [11, 2, '11:00', 1, 'scheduled'],
  [11, 5, '19:00', 7, 'scheduled'],
  [11, 9, '10:00', 5, 'draft'],
  [11, 12, '15:00', 2, 'scheduled'],
  [11, 17, '12:00', 8, 'scheduled'],
  [11, 20, '18:00', 9, 'scheduled']
];

export const CALENDAR_ITEMS: CalendarItem[] = CALENDAR_SPEC.map(([month, day, time, title, status], index) => ({
  id: `c${index + 1}`,
  title: TITLES[title] ?? 'Пост',
  at: atLocal(`2026-${pad(month)}-${pad(day)}`, time),
  status,
  channel: CHANNEL_NAMES[index % 3] ?? 'Dota Pulse',
  thumb: index % 5 === 0
}));

// --- Медиатека --------------------------------------------------------------------------------------------------

export type MediaKind = 'image' | 'gif' | 'video' | 'doc';
export type MediaItem = {
  id: string;
  name: string;
  kind: MediaKind;
  ext: string;
  size: number;
  width?: number;
  height?: number;
  uploadedAt: number;
  usedIn: string[];
  tags: string[];
  description: string;
  unavailable?: boolean;
};

export const KIND_LABEL: Record<MediaKind, string> = {
  image: 'Изображение',
  gif: 'GIF',
  video: 'Видео',
  doc: 'Документ'
};

const MEDIA_SPEC: ReadonlyArray<readonly [string, string, MediaKind, number, string, number]> = [
  ['obzor-nedeli', 'jpg', 'image', 482, '1920×1080', 3],
  ['draft-karta-3', 'png', 'image', 1240, '1600×900', 2],
  ['patch-737-banner', 'png', 'image', 910, '1920×640', 1],
  ['komanda-kollazh', 'jpg', 'image', 640, '1280×1280', 0],
  ['reaktsiya-ulybka', 'gif', 'gif', 2380, '480×270', 1],
  ['final-moment', 'mp4', 'video', 18_400, '1920×1080', 2],
  ['intervyu-fragment', 'mp4', 'video', 24_900, '1280×720', 0],
  ['raspisanie-turnira', 'pdf', 'doc', 310, '', 1],
  ['logo-kanala', 'svg', 'image', 18, '512×512', 4],
  ['obschaya-statistika', 'pdf', 'doc', 520, '', 0],
  ['geroi-nedeli', 'jpg', 'image', 730, '1080×1350', 2],
  ['anons-strima', 'png', 'image', 1180, '1920×1080', 1],
  ['smeshnoy-moment', 'gif', 'gif', 3100, '400×300', 0],
  ['obzor-predmetov', 'jpg', 'image', 590, '1600×1000', 1],
  ['highlights-uikend', 'mp4', 'video', 31_200, '1920×1080', 2],
  ['tablitsa-gruppy', 'png', 'image', 260, '1280×720', 1],
  ['obschenie-komanda', 'jpg', 'image', 880, '1920×1280', 0],
  ['zametki-balansa', 'pdf', 'doc', 140, '', 1],
  ['cover-novosti', 'jpg', 'image', 410, '1200×630', 3],
  ['klip-sbornoy', 'gif', 'gif', 1920, '640×360', 0],
  ['razbor-replaya', 'mp4', 'video', 15_700, '1280×720', 1],
  ['skrinshot-patcha', 'png', 'image', 340, '1440×900', 2],
  ['plakat-turnira', 'jpg', 'image', 1450, '1080×1920', 0],
  ['staryy-banner', 'jpg', 'image', 520, '1920×1080', 0]
];
const TAGS = ['турнир', 'патч', 'команды', 'гайд', 'обложка'];

export const MEDIA_ITEMS: MediaItem[] = MEDIA_SPEC.map(([name, ext, kind, size, dims, uses], index) => {
  const [w, h] = dims ? (dims.split('×').map(Number) as [number, number]) : [undefined, undefined];
  return {
    id: `m${index + 1}`,
    name: `${name}.${ext}`,
    kind,
    ext,
    size,
    ...(w ? { width: w, height: h } : {}),
    uploadedAt: NOW - (index * 29 + 3) * HOUR,
    usedIn: TITLES.slice(index % 9, (index % 9) + uses),
    tags: [TAGS[index % 5] ?? 'гайд', ...(index % 3 === 0 ? [TAGS[(index + 2) % 5] ?? 'патч'] : [])],
    description: index % 4 === 0 ? 'Обложка для регулярной рубрики, горизонтальная версия.' : '',
    ...(index === 21 ? { unavailable: true } : {})
  };
});

export const formatSize = (kb: number) => (kb >= 1024 ? `${(kb / 1024).toFixed(1).replace('.', ',')} МБ` : `${kb} КБ`);

// --- Автоматизации -----------------------------------------------------------------------------------------------

export type JobState = 'active' | 'off' | 'failed' | 'unknown';
export type Job = {
  id: string;
  name: string;
  purpose: string;
  cron: string;
  human: string;
  source: string;
  critical?: boolean;
  enabled: boolean;
  state: JobState;
  /** Minutes since the last run; null = never. */
  lastAgo: number | null;
  /** Minutes until the next run; null = none planned. */
  nextIn: number | null;
  lastOk: boolean;
  duration: number;
  does: string[];
  stale?: boolean;
};

export const JOBS: Job[] = [
  {
    id: 'j1',
    name: 'Очередь публикаций',
    purpose: 'Отправляет посты в Telegram по расписанию',
    cron: '*/5 * * * *',
    human: 'каждые 5 минут',
    source: 'D1: очередь',
    critical: true,
    enabled: true,
    state: 'active',
    lastAgo: 3,
    nextIn: 2,
    lastOk: true,
    duration: 1.2,
    does: [
      'Берёт запланированные публикации',
      'Захватывает каждую условным обновлением',
      'Отправляет и сохраняет результат'
    ]
  },
  {
    id: 'j2',
    name: 'Импорт событий Dota',
    purpose: 'Читает официальные новости и патчи',
    cron: '*/15 * * * *',
    human: 'каждые 15 минут',
    source: 'RSS: Dota 2 · блог',
    enabled: true,
    state: 'active',
    lastAgo: 9,
    nextIn: 6,
    lastOk: true,
    duration: 3.4,
    does: ['Запрашивает три разрешённых адреса', 'Сохраняет только заголовок, источник и время']
  },
  {
    id: 'j3',
    name: 'Заметки к патчам',
    purpose: 'Проверяет новые заметки к патчам',
    cron: '0 * * * *',
    human: 'каждый час',
    source: 'Patch notes',
    enabled: true,
    state: 'active',
    lastAgo: 40,
    nextIn: 20,
    lastOk: true,
    duration: 2.1,
    stale: true,
    does: ['Сравнивает версию с последней сохранённой', 'Создаёт событие «Патч»']
  },
  {
    id: 'j4',
    name: 'Снимки аналитики',
    purpose: 'Сохраняет просмотры и охваты за день',
    cron: '0 3 * * *',
    human: 'каждый день в 03:00',
    source: 'Telegram: статистика',
    enabled: true,
    state: 'failed',
    lastAgo: 380,
    nextIn: 1260,
    lastOk: false,
    duration: 8.8,
    does: ['Запрашивает статистику каналов', 'Записывает дневной снимок']
  },
  {
    id: 'j5',
    name: 'Очистка медиатеки',
    purpose: 'Удаляет неиспользуемые временные файлы',
    cron: '30 4 * * 0',
    human: 'по воскресеньям в 04:30',
    source: 'Хранилище файлов',
    enabled: true,
    state: 'active',
    lastAgo: 3 * 1440,
    nextIn: 4 * 1440,
    lastOk: true,
    duration: 12.6,
    does: ['Ищет загрузки без поста старше 7 дней', 'Удаляет только временные файлы']
  },
  {
    id: 'j6',
    name: 'Повтор неудачных отправок',
    purpose: 'Повторяет отправки после временных ошибок',
    cron: '*/10 * * * *',
    human: 'каждые 10 минут',
    source: 'D1: очередь',
    enabled: false,
    state: 'off',
    lastAgo: 5 * 1440,
    nextIn: null,
    lastOk: true,
    duration: 0.9,
    does: ['Берёт публикации в ожидании повтора', 'Не трогает статус «Требует проверки»']
  },
  {
    id: 'j7',
    name: 'Проверка источников',
    purpose: 'Проверяет доступность разрешённых адресов',
    cron: '*/30 * * * *',
    human: 'каждые 30 минут',
    source: 'Источники',
    enabled: true,
    state: 'unknown',
    lastAgo: null,
    nextIn: null,
    lastOk: true,
    duration: 0,
    does: ['Запрашивает заголовки адресов', 'Отмечает недоступные источники']
  }
];

export type JobRun = { id: string; jobId: string; ago: number; ok: boolean; duration: number; message: string };
export const jobRuns = (job: Job): JobRun[] => {
  const rand = seeded(job.id.charCodeAt(1) * 977);
  const step = job.cron.startsWith('*/') ? Number(job.cron.slice(2, 4).replace(' ', '')) : 60;
  return Array.from({ length: 10 }, (_, index) => {
    const ok = !(job.state === 'failed' && index === 0) && rand() > 0.07;
    return {
      id: `run_${job.id}${String(index).padStart(2, '0')}${Math.floor(rand() * 900 + 100)}`,
      jobId: job.id,
      ago: (job.lastAgo ?? 60) + index * step,
      ok,
      duration: Math.round(job.duration * (0.8 + rand() * 0.5) * 10) / 10,
      message: ok ? 'Готово без замечаний' : 'Ответ источника: таймаут 30 с'
    };
  });
};
export const agoText = (minutes: number) =>
  minutes < 60
    ? `${minutes} мин назад`
    : minutes < 1440
      ? `${Math.round(minutes / 60)} ч назад`
      : `${Math.round(minutes / 1440)} дн. назад`;
export const inText = (minutes: number) =>
  minutes < 60
    ? `через ${minutes} мин`
    : minutes < 1440
      ? `через ${Math.round(minutes / 60)} ч`
      : `через ${Math.round(minutes / 1440)} дн.`;

// --- События и источники (Dota Pulse) -----------------------------------------------------------------------------

export type EventType = 'patch' | 'news' | 'tournament';
export const EVENT_LABEL: Record<EventType, string> = { patch: 'Патч', news: 'Новость', tournament: 'Турнир' };
export type SourceStatus = 'up' | 'stale' | 'down';
export type Source = {
  id: string;
  name: string;
  domain: string;
  checkedAgo: number;
  change: string;
  status: SourceStatus;
  allowed: string[];
};
export const SOURCES: Source[] = [
  {
    id: 's1',
    name: 'Dota 2 · блог',
    domain: 'dota2.example.com',
    checkedAgo: 9,
    change: '2 новых записи',
    status: 'up',
    allowed: ['dota2.example.com', 'cdn.dota2.example.com']
  },
  {
    id: 's2',
    name: 'Patch notes',
    domain: 'patches.example.com',
    checkedAgo: 155,
    change: 'без изменений',
    status: 'down',
    allowed: ['patches.example.com']
  },
  {
    id: 's3',
    name: 'Tournaments',
    domain: 'events.example.org',
    checkedAgo: 48,
    change: '1 новое событие',
    status: 'stale',
    allowed: ['events.example.org', 'api.events.example.org']
  }
];
export type DotaEvent = { id: string; type: EventType; title: string; sourceId: string; agoMin: number };
const EVENT_SPEC: ReadonlyArray<readonly [EventType, string, string, number]> = [
  ['patch', 'Патч 7.37c: правки баланса и исправления', 's2', 130],
  ['news', 'Анонс сезона квалификаций в регионе СНГ', 's1', 55],
  ['tournament', 'Групповой этап открытого турнира стартует в пятницу', 's3', 190],
  ['news', 'Обновление режима наблюдения за матчем', 's1', 310],
  ['patch', 'Заметки к патчу 7.37b: предметы и нейтральные крипы', 's2', 520],
  ['tournament', 'Опубликована сетка плей-офф весеннего кубка', 's3', 780],
  ['news', 'Исправление ошибки с рейтинговым подбором', 's1', 1100],
  ['news', 'Праздничное событие в игре: расписание и награды', 's1', 1500],
  ['tournament', 'Регистрация открытых квалификаций продлена на сутки', 's3', 1900],
  ['patch', 'Мини-патч 7.37a: срочные исправления героев', 's2', 2600],
  ['news', 'Итоги голосования сообщества за новые косметические наборы', 's1', 3300],
  ['tournament', 'Перенос матча четвертьфинала из-за технических причин', 's3', 4200]
];
export const DOTA_EVENTS: DotaEvent[] = EVENT_SPEC.map(([type, title, sourceId, agoMin], index) => ({
  id: `e${index + 1}`,
  type,
  title,
  sourceId,
  agoMin
}));
export const relativeAgo = (minutes: number) => agoText(minutes);

// --- Аналитика -----------------------------------------------------------------------------------------------------

export type DayPoint = {
  label: string;
  views: number;
  reactions: number;
  reposts: number;
  sent: number;
  errors: number;
};
export function buildSeries(days: number, seed: number, endOffsetDays: number): DayPoint[] {
  const rand = seeded(seed * 7919 + days * 31 + endOffsetDays * 101);
  const end = addDays(TODAY_KEY, -endOffsetDays * days);
  return Array.from({ length: days }, (_, index) => {
    const key = addDays(end, index - days + 1);
    const weekday = weekdayOf(key);
    const base = 6000 + rand() * 30_000 + (weekday >= 5 ? 9000 : 0);
    const views = Math.round(Math.min(48_000, base));
    return {
      label: `${dayNumber(key)} ${monthShort(monthOfKey(key))}.`,
      views,
      reactions: Math.round(views * (0.08 + rand() * 0.04)),
      reposts: Math.round(views * (0.025 + rand() * 0.015)),
      sent: Math.round(rand() * 3) + (weekday < 5 ? 1 : 0),
      errors: index === Math.floor(days * 0.6) ? 3 : rand() > 0.93 ? 1 : 0
    };
  });
}
export const TOP_POSTS = TITLES.slice(0, 5).map((title, index) => ({
  id: `t${index + 1}`,
  title,
  rubric: ['Новости', 'Гайды', 'Патчи', 'Турниры', 'Опрос'][index] ?? 'Новости',
  at: NOW - (index * 2 + 1) * 24 * HOUR,
  views: 46_200 - index * 6_100,
  er: 9.6 - index * 0.9
}));

// --- Поиск ---------------------------------------------------------------------------------------------------------

export const SEARCH_POSTS = [
  { id: 'p4', title: 'Патч 7.37: что изменилось у героев', hint: 'Одобрен' },
  { id: 'p3', title: 'Разбор драфта третьей карты', hint: 'Черновик' },
  { id: 'p1', title: 'Итоги недели в про-сцене', hint: 'Отправлен' }
];
export const SEARCH_PUBLICATIONS = [
  { id: 'u1', title: 'Итоги недели в про-сцене', hint: 'Запланировано · 14:30' },
  { id: 'u4', title: 'Патч 7.37: что изменилось у героев', hint: 'Требует проверки' },
  { id: 'u2', title: 'Календарь турниров на ноябрь', hint: 'Отправлено' }
];
