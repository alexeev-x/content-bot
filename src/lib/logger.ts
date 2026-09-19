type Level = 'info' | 'warn' | 'error';
type Fields = Record<string, unknown>;

/** Структурный лог. ❌ Токены, заголовки авторизации и тексты автора сюда не попадают. */
const write = (level: Level, message: string, fields: Fields = {}) => {
  const line = JSON.stringify({ level, message, time: new Date().toISOString(), ...fields });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
};

export const logger = {
  info: (message: string, fields?: Fields) => write('info', message, fields),
  warn: (message: string, fields?: Fields) => write('warn', message, fields),
  error: (message: string, fields?: Fields) => write('error', message, fields),
};
