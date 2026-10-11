import { describe, expect, it } from 'vitest';
import { postTitleSortKey } from './post-title-sort-key';

const collator = new Intl.Collator('ru-RU', { numeric: true, sensitivity: 'base' });

describe('post title sort key', () => {
  it('matches the previous Russian case-, accent- and number-insensitive order', () => {
    const titles = [
      'Пост 10',
      'Ёлка',
      'Пост 2',
      'Енот',
      'Альфа 10',
      'альфа 2',
      'Пост 02',
      'Cafe 3',
      'Café 2',
      'Дота 7.40',
      'Дота 7.9',
      'A-1',
      'A 1',
      'Журнал'
    ];
    const letters = [...'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
    titles.push(...letters);

    for (const left of titles) {
      for (const right of titles) {
        const expected = Math.sign(collator.compare(left, right));
        const leftKey = postTitleSortKey(left);
        const rightKey = postTitleSortKey(right);
        const actual = leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
        expect(actual, `${JSON.stringify(left)} vs ${JSON.stringify(right)}`).toBe(expected);
      }
    }
  });

  it('folds case, accents, ё, and leading zeroes to the same primary key', () => {
    expect(postTitleSortKey('Енот 02')).toBe(postTitleSortKey('ЁНОТ 2'));
    expect(postTitleSortKey('Cafe')).toBe(postTitleSortKey('CAFÉ'));
  });
});
