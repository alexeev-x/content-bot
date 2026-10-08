import { describe, expect, it } from 'vitest';
import { ru } from '../../../shared/lib/ru';
import type { StatusCheck } from '../../../shared/lib/status-check';
import { checkWord, isSwitchedOff } from './check-word';

const publishing = (summary: string): StatusCheck => ({ id: 'publishing', name: 'Публикация', tone: 'ok', summary });

describe('check word', () => {
  it('marks disabled publishing as switched off, so its dot is not green', () => {
    expect(isSwitchedOff(publishing(ru.health.publishingDisabled))).toBe(true);
    expect(checkWord(publishing(ru.health.publishingDisabled))).toBe('Отключена');
  });

  it('keeps enabled publishing and other healthy checks green', () => {
    expect(isSwitchedOff(publishing(ru.health.publishingEnabled))).toBe(false);
    expect(isSwitchedOff({ id: 'bot', name: 'Бот', tone: 'ok', summary: 'Работает' })).toBe(false);
  });
});
