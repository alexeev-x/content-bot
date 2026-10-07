// Code → reason (ru) from docs/stories/dashboard-today-incidents.md; an unmapped code is shown as «Ошибка <code>».
const REASONS: Record<string, string> = {
  SEND_UNCONFIRMED: 'Ответ Telegram не получен, сообщение могло уйти',
  RETRIES_EXHAUSTED: 'Лимиты Telegram: попытки исчерпаны',
  DESTINATION_UNAVAILABLE: 'Бот потерял доступ к каналу',
  DESTINATION_DISABLED: 'Канал отключён',
  CONTENT_INVALID: 'Текст не принят Telegram',
  CHAT_MIGRATED: 'Канал сменил адрес',
  BOT_UNAUTHORIZED: 'Токен бота не принят',
  PUBLICATION_MISSING: 'Публикация не найдена'
};

export function incidentReason(code: string): string {
  return REASONS[code] ?? `Ошибка ${code}`;
}
