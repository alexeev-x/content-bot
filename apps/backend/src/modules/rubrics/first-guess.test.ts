import { describe, expect, it } from 'vitest';
import { firstGuess } from './first-guess';

// «Первым угадал»: a wrong match names the wrong reader in the channel.

const LEXICON = [
  { w: ['Abaddon', 'Абадон', 'аба'], m: 'прозвище героя Abaddon; о герое — «он»' },
  { w: ['Anti-Mage', 'Антимаг', 'АМ', 'магина'], m: 'прозвище героя Anti-Mage' },
  { w: ['Pudge', 'Пудж'], m: 'прозвище героя Pudge' },
  { w: ['Invoker', 'Инвокер', 'инвок'], m: 'прозвище героя Invoker' }
];
const comment = (text: string, at: number, username: string | null = `u${at}`) => ({
  text,
  createdAt: at,
  messageId: at,
  username
});

describe('firstGuess', () => {
  it('takes the first comment naming the hero, with a case ending', () => {
    expect(
      firstGuess(LEXICON, { name: 'Abaddon', key: 'abaddon' }, [comment('это абадона ульта', 2), comment('аба', 1)])
    ).toEqual({ found: true, username: 'u1' });
  });

  it('does not take a longer word or a two-letter nickname', () => {
    expect(firstGuess(LEXICON, { name: 'Abaddon', key: 'abaddon' }, [comment('купил абажур', 1)])).toEqual({
      found: false
    });
    expect(firstGuess(LEXICON, { name: 'Anti-Mage', key: 'antimage' }, [comment('ам', 1)])).toEqual({ found: false });
  });

  it('skips a spray of three heroes and keeps a reader without a username', () => {
    expect(
      firstGuess(LEXICON, { name: 'Pudge', key: 'pudge' }, [comment('пудж инвокер аба', 1), comment('Пудж!', 2, null)])
    ).toEqual({ found: true, username: null });
  });
});
