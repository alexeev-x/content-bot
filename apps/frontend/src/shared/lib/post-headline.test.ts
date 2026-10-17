import { describe, expect, it } from 'vitest';
import { postHeadline } from './post-headline';

describe('post row text', () => {
  it('shows only what follows the headline, never the same words twice', () => {
    expect(postHeadline('Кто мы если не мы', 'Кто мы если не мы')).toEqual({ headline: 'Кто мы если не мы', rest: '' });
    expect(postHeadline('выап ❌ 🌈', 'выап ❌ 🌈\nфывафыва фывафыва')).toEqual({
      headline: 'выап ❌ 🌈',
      rest: 'фывафыва фывафыва'
    });
  });

  it('takes the first line when there is no title, and keeps a text that differs from the title', () => {
    expect(postHeadline('', '\nПервая строка.\nДальше текст')).toEqual({
      headline: 'Первая строка.',
      rest: 'Дальше текст'
    });
    expect(postHeadline('Анонс', 'Завтра стрим')).toEqual({ headline: 'Анонс', rest: 'Завтра стрим' });
  });
});
