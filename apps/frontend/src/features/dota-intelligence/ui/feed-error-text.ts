import type { DotaFeedErrorDto } from '@alexeev/contracts';

type FeedCode = 'FETCH' | 'HTTP' | 'BODY_LIMIT' | 'JSON' | 'SHAPE' | 'STORE';

function kind(code: string): FeedCode | null {
  const match = /(?:^|_)(FETCH|HTTP|BODY_LIMIT|JSON|SHAPE|STORE)$/.exec(code);
  return match ? (match[1] as FeedCode) : null;
}

function httpMeaning(status: number | null): string {
  if (status === null) return 'сервер ответил ошибкой';
  if (status >= 300 && status < 400)
    return `ответил ${status} — адрес переехал, а лента не переходит по перенаправлениям`;
  if (status === 401 || status === 403) return `ответил ${status} — доступ запрещён`;
  if (status === 404) return 'ответил 404 — страница не найдена, адрес ленты мог измениться';
  if (status === 429) return 'ответил 429 — слишком много запросов, нужно подождать';
  if (status >= 500) return `ответил ${status} — сбой на стороне сервера, обычно проходит сам`;
  return `ответил ${status} — запрос не принят`;
}

/** Plain-language reason for the owner; the technical detail stays in the dialog and the copied text. */
export function explainFeedError(error: DotaFeedErrorDto, provider: string): string {
  // The watches' own codes (game files, Steam signal).
  if (error.code === 'GITHUB_TOKEN')
    return 'GitHub не принял токен: он отозван или истёк. Нужен новый токен в секрете GITHUB_TOKEN воркера.';
  if (error.code === 'GITHUB_RATE')
    return 'GitHub временно ограничил число запросов. Проверка продолжится сама, когда лимит сбросится.';
  if (/^STEAM_CM_(CONNECT|TIMEOUT|DIRECTORY)$/.test(error.code))
    return 'Не удалось достучаться до серверов Steam или они не ответили вовремя. Обычно проходит само со следующей проверкой.';
  if (error.code === 'STEAM_CM_LOGON')
    return 'Steam не пустил анонимный вход. Если ошибка повторяется, Steam мог поменять правила подключения.';
  switch (kind(error.code)) {
    case 'FETCH':
      return `Не удалось получить ответ от ${provider}: сервер не ответил вовремя или соединение оборвалось. Приложение повторит проверку само.`;
    case 'HTTP':
      return `Сервер ${provider} ${httpMeaning(error.httpStatus)}.`;
    case 'BODY_LIMIT':
      return `${provider} прислал ответ больше допустимого размера, поэтому он отброшен. Нужно поднять лимит в приложении.`;
    case 'JSON':
      return `${provider} ответил, но это не читаемые данные (не JSON). Возможно, вместо данных пришла страница с ошибкой.`;
    case 'SHAPE':
      return `${provider} изменил формат данных: в ответе нет ожидаемого поля или оно другого вида. Нужно обновить разбор в приложении.`;
    case 'STORE':
      return 'Данные получены, но их не удалось сохранить в базе приложения. Это сбой самого приложения, а не источника.';
    default:
      return 'Проверка завершилась ошибкой неизвестного вида.';
  }
}

/** Text the owner pastes to the developer: stable codes only, no secrets. */
export function feedErrorReport(feedName: string, error: DotaFeedErrorDto): string {
  return [
    `Лента: ${feedName}`,
    `Код: ${error.code}`,
    `HTTP-статус: ${error.httpStatus ?? '—'}`,
    `Подробности: ${error.detail === '' ? '—' : error.detail}`,
    `Время ошибки: ${error.at}`,
    `Неудачных проверок подряд: ${error.consecutiveFailures}`,
    `Последний успех: ${error.lastSuccessAt ?? 'не было'}`
  ].join('\n');
}
