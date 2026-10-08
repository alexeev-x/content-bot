import { ru } from '../../../shared/lib/ru';
import type { StatusCheck } from '../../../shared/lib/status-check';

const word = { checking: 'Проверяем', on: 'Включена', off: 'Отключена' } as const;

/**
 * The one-word state of a check for a list line («Работает», «Не подключён»): the same word in the top-bar status
 * popover and the «Система» panel. A healthy publishing check names its switch instead («Включена»).
 */
export function checkWord(check: StatusCheck): string {
  if (check.tone === 'loading') return word.checking;
  if (check.tone !== 'ok') return check.summary;
  if (check.id === 'publishing') return check.summary === ru.health.publishingEnabled ? word.on : word.off;
  return ru.status.ok;
}

/**
 * A check that is fine but deliberately switched off (publishing disabled in config): its dot is neutral, not green,
 * because green would read as "sending works".
 */
export function isSwitchedOff(check: StatusCheck): boolean {
  return check.tone === 'ok' && check.id === 'publishing' && check.summary !== ru.health.publishingEnabled;
}
