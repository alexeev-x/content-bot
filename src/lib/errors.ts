export type ErrorCode = 'unauthorized' | 'bad_request' | 'not_configured' | 'upstream_failed' | 'internal';

type AppErrorOptions = {
  /** Есть ли смысл повторить: решает очередь и планировщик. */
  retryable?: boolean;
  cause?: unknown;
};

/**
 * Метка вместо `instanceof`: при дублировании модуля (сборщик, тестовый раннер, две копии пакета)
 * проверка по классу молча перестаёт срабатывать, и наша ошибка превращается в 500.
 * `Symbol.for` общий для всех копий.
 */
const APP_ERROR = Symbol.for('content-bot.AppError');

/**
 * Единственная ошибка, которую бросает приложение. Транспорта не знает: её кидают и обработчик
 * webhook, и очередь, и cron. Как превратить код в HTTP-статус, решает вход (app/middleware).
 */
export class AppError extends Error {
  readonly [APP_ERROR] = true;
  readonly code: ErrorCode;
  readonly retryable: boolean;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.retryable = options.retryable ?? false;
  }
}

export const isAppError = (error: unknown): error is AppError =>
  typeof error === 'object' && error !== null && APP_ERROR in error;
