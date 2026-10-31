// Why a rubric slot did not go out, in the owner's words (owner, 31.10.2026: «где хранить вышла не вышла, так же
// причину»). The codes are the slot's stable `error_code`; one place, so «Рубрики», Обзор and /lab read alike.

const REASONS: Record<string, string> = {
  BUILD_LOST: 'сборка оборвалась (время или память), слот перешёл к следующей рубрике',
  DEADLINE: 'срок прошёл, а пост не был готов',
  PATCH_CHANGED: 'после сборки вышел патч: цифры могли устареть, пост не вышел',
  NOTHING_BUILT: 'нечего было выпускать: пост не собрался',
  BUILD_FAILED: 'сборка упала',
  REHEARSAL_BUILD_FAILED: 'сборка упала (сбой репетиции)',
  PICTURE_RENDER_FAILED: 'картинка не нарисовалась',
  PICTURE_SCENE_FAILED: 'сцена для картинки не получилась',
  BROWSER_BUDGET: 'дневной лимит браузера для картинок исчерпан',
  CONTENT_SKIP: 'сегодня нечего сказать: пропуск',
  NO_DATA: 'нет данных для поста',
  BANK_EXHAUSTED: 'банк записей закончился',
  TOO_SIMILAR: 'текст слишком похож на недавний',
  HERO_RECENT: 'этот герой уже был в рубрике за 3 дня',
  UNKNOWN_RUBRIC: 'неизвестная рубрика',
  STORE_FAILED: 'пост не сохранился в студии',
  AI_UNAVAILABLE: 'ИИ недоступен',
  DATA_SOURCE_UNAVAILABLE: 'источник данных недоступен',
  SWITCHED_OFF: 'планировщик выключили',
  REPLANNED: 'план перестроен',
  RELEASE_FAILED: 'не удалось поставить в публикацию',
  NOT_AFTER_PASSED: 'не успел выйти за 20 минут после своего времени',
  OWNER_CANCELLED: 'публикацию отменили вручную',
  DESTINATION_UNAVAILABLE: 'канал недоступен для бота',
  DESTINATION_DISABLED: 'канал выключен',
  CONTENT_INVALID: 'Telegram не принял текст',
  RATE_LIMITED: 'Telegram просил подождать',
  POLL_NOT_FOUND: 'опрос не найден в Telegram',
  NO_POLL_MESSAGE: 'нет сообщения с опросом',
  send_failed: 'Telegram отказал в отправке',
  missed: 'не вышел вовремя',
  cancelled: 'отменён'
};

/** The reason in Russian, or the bare code when it has no wording yet. */
export function rubricSlotReason(code: string | null): string | null {
  if (code === null) return null;
  return REASONS[code] ?? `код ${code}`;
}
