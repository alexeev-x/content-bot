import { utcOffsetLabel } from '../../../shared/lib/owner-timezone';

export type TimezoneOption = { id: string; label: string; offset: string; search: string };

// Popular zones for this owner's region get Russian names; the rest show the IANA city.
const RUSSIAN_NAMES: Record<string, string> = {
  'Europe/Chisinau': 'Кишинёв',
  'Europe/Moscow': 'Москва',
  'Europe/Kyiv': 'Киев',
  'Europe/Kiev': 'Киев',
  'Europe/Minsk': 'Минск',
  'Europe/Bucharest': 'Бухарест',
  'Europe/Kaliningrad': 'Калининград',
  'Europe/Samara': 'Самара',
  'Europe/London': 'Лондон',
  'Europe/Berlin': 'Берлин',
  'Europe/Paris': 'Париж',
  'Europe/Madrid': 'Мадрид',
  'Europe/Rome': 'Рим',
  'Europe/Warsaw': 'Варшава',
  'Europe/Istanbul': 'Стамбул',
  'Asia/Yekaterinburg': 'Екатеринбург',
  'Asia/Novosibirsk': 'Новосибирск',
  'Asia/Vladivostok': 'Владивосток',
  'Asia/Tbilisi': 'Тбилиси',
  'Asia/Yerevan': 'Ереван',
  'Asia/Baku': 'Баку',
  'Asia/Almaty': 'Алматы',
  'Asia/Tashkent': 'Ташкент',
  'Asia/Dubai': 'Дубай',
  'Asia/Tokyo': 'Токио',
  'America/New_York': 'Нью-Йорк',
  'America/Los_Angeles': 'Лос-Анджелес',
  UTC: 'Всемирное время'
};

function cityOf(id: string): string {
  return (id.split('/').pop() ?? id).replaceAll('_', ' ');
}

/** Every IANA zone the browser knows, plus `extra` (the saved zone may be one the browser does not list). */
export function timezoneOptions(now: Date, extra: string): TimezoneOption[] {
  const supported = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  const ids = new Set([...supported, 'UTC', extra]);
  return [...ids].map((id) => {
    const name = RUSSIAN_NAMES[id] ?? cityOf(id);
    const offset = utcOffsetLabel(now, id);
    return { id, label: `${name} (${offset})`, offset, search: `${name} ${id} ${offset}`.toLowerCase() };
  });
}

export const browserTimezone = (): string | null => {
  try {
    return new Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
};
