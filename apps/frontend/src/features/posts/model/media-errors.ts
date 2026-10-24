import { ApiError } from '../../../shared/api/http-client';

export function friendlyError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 413) return 'Файл слишком большой или превышен лимит вложений.';
    if (error.status === 409) return 'Черновик изменился. Сравните его с серверной версией перед повтором действия.';
    if (error.status === 401) return 'Сессия завершилась. Войдите снова и повторите загрузку.';
    if (error.status === 403) return 'Нет доступа к этому черновику.';
  }
  return 'Не удалось загрузить файл. Проверьте соединение и повторите попытку.';
}

export function libraryAttachError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Сессия завершилась. Войдите снова и повторите добавление.';
    if (error.status === 403) return 'Нет доступа к выбранному файлу или черновику.';
    if (error.status === 404) return 'Файл больше недоступен в медиатеке. Обновите список и выберите его снова.';
    if (error.status === 409)
      return 'Черновик изменился. Сначала разрешите конфликт версий, затем повторите добавление.';
    if (error.reason === 'MEDIA_LIMIT_EXCEEDED') return 'В посте уже достигнут лимит в 10 файлов.';
    if (error.status === 429) return 'Слишком много запросов. Подождите немного и повторите добавление.';
    if (error.requestId) return `Не удалось добавить файлы. Код запроса: ${error.requestId}`;
  }
  return 'Не удалось добавить выбранные файлы. Проверьте соединение и повторите попытку.';
}

export function cropErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message === 'crop-too-large')
    return 'Кадр слишком велик для загрузки. Уменьшите область кадрирования; исходное вложение сохранено.';
  if (error instanceof ApiError) {
    if (error.status === 404) return 'Файл больше недоступен. Обновите редактор и выберите вложение ещё раз.';
    if (error.status === 400)
      return 'Не удалось обработать кадрирование. Измените область и повторите попытку; исходное вложение сохранено.';
    if (error.status === 413)
      return 'Кадр слишком велик для загрузки. Уменьшите область кадрирования; исходное вложение сохранено.';
    if (error.status === 503)
      return 'Не удалось сохранить кадрирование: сервис временно недоступен. Повторите попытку позже; исходное вложение сохранено.';
    if (error.status === 409) return 'Черновик изменился. Обновите редактор перед повторным кадрированием.';
  }
  return `Не удалось применить кадрирование. Исходное вложение сохранено. ${friendlyError(error)}`;
}
