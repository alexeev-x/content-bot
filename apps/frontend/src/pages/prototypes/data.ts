// Mock data for the clickable prototype only (docs/design/UX_SPEC.md §6). Nothing here reaches a network.
import type { StatusKey } from '../../shared/ui';

export type ChannelState = 'ok' | 'norights' | 'unreachable';
export type Channel = { id: string; name: string; handle: string; state: ChannelState; enabled: boolean };

export type PostState = 'draft' | 'approved' | 'scheduled' | 'preparing' | 'sent' | 'unknown';
export type Post = {
  id: string;
  title: string;
  body: string;
  state: PostState;
  /** Display text of the last edit and its sort key. */
  edited: string;
  editedAt: number;
  /** Planned send time, shown beside «Запланирован». */
  plannedLabel?: string;
  archived?: boolean;
  /** Days before an archived post is deleted for good. */
  daysLeft?: number;
};

export type Publication = {
  id: string;
  postId: string;
  channelId: string;
  status: StatusKey;
  at: number;
  /** Telegram message number, only for `sent`. */
  messageId?: string;
  attempts: number;
  failure?: string;
};

export type Incident = {
  id: string;
  publicationId: string;
  kind: 'unknown' | 'failed';
  reason: string;
  code: string;
  open: boolean;
  at: number;
};

// «Сегодня» of the prototype is fixed, so every screenshot is identical.
export const NOW = Date.UTC(2026, 9, 8, 9, 40);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const CHANNELS: Channel[] = [
  { id: 'c1', name: 'Official RU', handle: '@alexeev_official_ru', state: 'ok', enabled: true },
  {
    id: 'c2',
    name: 'Dota Pulse RU: новости патчей, турниров и составов для русскоязычного сообщества',
    handle: '-1002233445566',
    state: 'ok',
    enabled: true
  },
  { id: 'c3', name: 'Тестовый канал (DEV)', handle: '@alexeev_dev_test', state: 'norights', enabled: true }
];

export const POSTS: Post[] = [
  {
    id: 'p1',
    title: 'Патч 7.37d: что изменилось в балансе героев',
    body: 'Вышел патч 7.37d. Главное: нерф Terrorblade, баффы для Marci и Dawnbreaker, правки лесных лагерей.\n\nПодробный разбор по ролям читайте ниже.',
    state: 'scheduled',
    plannedLabel: '8 окт., 15:00',
    edited: 'сегодня, 08:12',
    editedAt: NOW - 90 * 60_000
  },
  {
    id: 'p2',
    title: 'Новый сундук и наборы TI: все предметы и цены',
    body: 'В магазине появился сундук турнира. Внутри 12 предметов, шанс редкого сета — 4%.',
    state: 'sent',
    edited: 'вчера, 19:40',
    editedAt: NOW - 14 * HOUR
  },
  {
    id: 'p3',
    title: 'Черновик: итоги недели в про-сцене',
    body: 'Team Spirit проиграла в четвертьфинале. Разбираем драфт третьей карты.',
    state: 'draft',
    edited: 'сегодня, 09:05',
    editedAt: NOW - 35 * 60_000
  },
  {
    id: 'p4',
    title: 'Анонс стрима: разбираем грандфинал вместе',
    body: 'Сегодня в 20:00 по Кишинёву. Ссылку пришлём за 10 минут до начала.',
    state: 'approved',
    edited: 'вчера, 22:10',
    editedAt: NOW - 11 * HOUR
  },
  {
    id: 'p5',
    title: 'Герой дня: Muerta. Сборки, таланты, контрпики',
    body: 'Muerta снова в мете. Показываем три рабочие сборки и героев, против которых она слабее всего.',
    state: 'unknown',
    edited: '7 окт., 14:30',
    editedAt: NOW - 19 * HOUR
  },
  {
    id: 'p6',
    title: 'Рейтинг команд: октябрь',
    body: 'Обновили таблицу рейтинга. Движение в топ-10: две команды вышли вперёд.',
    state: 'preparing',
    edited: 'сегодня, 09:38',
    editedAt: NOW - 2 * 60_000
  },
  {
    id: 'p7',
    title: 'Как выбрать героя для рейтинговых игр',
    body: 'Короткий чек-лист: пул, роль в команде, карта пиков.',
    state: 'draft',
    edited: '5 окт., 11:02',
    editedAt: NOW - 3 * DAY
  },
  {
    id: 'p8',
    title: 'Скидки на аркану: список героев',
    body: 'До конца недели действуют скидки на аркану для 14 героев.',
    state: 'sent',
    edited: '4 окт., 16:20',
    editedAt: NOW - 4 * DAY
  },
  {
    id: 'p9',
    title: 'Неделя матчей: расписание на выходные',
    body: 'Сетка плей-офф и время начала.',
    state: 'sent',
    edited: '1 окт., 10:00',
    editedAt: NOW - 7 * DAY,
    archived: true,
    daysLeft: 23
  },
  {
    id: 'p10',
    title: 'Старый анонс: турнир выходного дня',
    body: 'Регистрация закрыта.',
    state: 'sent',
    edited: '28 сент., 12:30',
    editedAt: NOW - 10 * DAY,
    archived: true,
    daysLeft: 20
  },
  {
    id: 'p11',
    title: 'Черновик, который не пригодился',
    body: '',
    state: 'draft',
    edited: '20 сент., 09:15',
    editedAt: NOW - 18 * DAY,
    archived: true,
    daysLeft: 12
  },
  {
    id: 'p12',
    title: 'Итоги дня: короткая сводка матчей',
    body: 'Коротко о главных матчах: счёт, лучшие игроки и что ждёт завтра.',
    state: 'sent',
    edited: 'сегодня, 11:30',
    editedAt: NOW - 70 * 60_000
  }
];

export const PUBLICATIONS: Publication[] = [
  { id: 'u1', postId: 'p1', channelId: 'c1', status: 'scheduled', at: NOW + 140 * 60_000, attempts: 0 },
  { id: 'u2', postId: 'p4', channelId: 'c2', status: 'scheduled', at: NOW + 560 * 60_000, attempts: 0 },
  { id: 'u3', postId: 'p6', channelId: 'c1', status: 'sending', at: NOW - 2 * 60_000, attempts: 1 },
  { id: 'u4', postId: 'p5', channelId: 'c1', status: 'unknown', at: NOW - 19 * HOUR, attempts: 1 },
  {
    id: 'u5',
    postId: 'p2',
    channelId: 'c1',
    status: 'sent',
    at: NOW - 14 * HOUR,
    messageId: '4821',
    attempts: 1
  },
  {
    id: 'u6',
    postId: 'p8',
    channelId: 'c2',
    status: 'sent',
    at: NOW - 4 * DAY,
    messageId: '4790',
    attempts: 1
  },
  {
    id: 'u7',
    postId: 'p2',
    channelId: 'c2',
    status: 'failed',
    at: NOW - 13 * HOUR,
    attempts: 3,
    failure: 'Бот не является администратором канала'
  },
  { id: 'u8', postId: 'p3', channelId: 'c3', status: 'retry_wait', at: NOW + 20 * 60_000, attempts: 2 },
  { id: 'u9', postId: 'p9', channelId: 'c1', status: 'sent', at: NOW - 7 * DAY, messageId: '4702', attempts: 1 },
  { id: 'u10', postId: 'p10', channelId: 'c2', status: 'cancelled', at: NOW - 10 * DAY, attempts: 0 },
  { id: 'u11', postId: 'p2', channelId: 'c1', status: 'sent', at: NOW - 210 * 60_000, messageId: '4830', attempts: 1 },
  { id: 'u12', postId: 'p12', channelId: 'c1', status: 'sent', at: NOW - 60 * 60_000, messageId: '4836', attempts: 1 }
];

export const INCIDENTS: Incident[] = [
  {
    id: 'i1',
    publicationId: 'u4',
    kind: 'unknown',
    reason: 'Telegram не ответил. Сообщение могло уйти.',
    code: 'telegram_timeout',
    open: true,
    at: NOW - 19 * HOUR
  },
  {
    id: 'i2',
    publicationId: 'u7',
    kind: 'failed',
    reason: 'Бот не является администратором канала.',
    code: 'chat_admin_required',
    open: true,
    at: NOW - 13 * HOUR
  },
  {
    id: 'i3',
    publicationId: 'u6',
    kind: 'failed',
    reason: 'Слишком длинный текст: 4310 из 4096 знаков.',
    code: 'message_too_long',
    open: false,
    at: NOW - 5 * DAY
  }
];

const MONTHS = ['янв.', 'февр.', 'марта', 'апр.', 'мая', 'июня', 'июля', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
const ZONE_OFFSET_H = 3;

/** Local (Europe/Chisinau, UTC+3) wall-clock parts of an instant. */
function parts(ts: number) {
  const date = new Date(ts + ZONE_OFFSET_H * HOUR);
  return { d: date.getUTCDate(), m: date.getUTCMonth(), h: date.getUTCHours(), min: date.getUTCMinutes() };
}
const two = (value: number) => String(value).padStart(2, '0');

export const formatTime = (ts: number) => {
  const p = parts(ts);
  return `${two(p.h)}:${two(p.min)}`;
};
export const formatDateTime = (ts: number) => {
  const p = parts(ts);
  return `${p.d} ${MONTHS[p.m]}, ${two(p.h)}:${two(p.min)}`;
};
export const formatUtc = (ts: number) => {
  const date = new Date(ts);
  return `${two(date.getUTCDate())}.${two(date.getUTCMonth() + 1)}.${date.getUTCFullYear()} ${two(date.getUTCHours())}:${two(date.getUTCMinutes())} UTC`;
};

export const excerptOf = (body: string) => body.replace(/\s+/g, ' ').trim().slice(0, 90);
export const statusOfPost = (state: PostState): StatusKey => (state === 'preparing' ? 'preparing' : state);
