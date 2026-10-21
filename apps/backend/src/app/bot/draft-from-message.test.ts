import { describe, expect, it } from 'vitest';
import { draftFromMessageText, linkTrailingSource } from './draft-from-message';

const URL_ = 'https://www.dota2.com/newsentry/681888927386174386';

describe('linkTrailingSource', () => {
  it('hides a trailing link behind its word, with UTF-16 offsets the post keeps', () => {
    const cases: [string, string, string][] = [
      [`Габен 🦈 вернул аркану.\n\nПодробности: ${URL_}`, 'Габен 🦈 вернул аркану.\n\nПодробности', 'Подробности'],
      [`Текст.\n\n${URL_}`, 'Текст.\n\nПодробнее', 'Подробнее'],
      [`Текст.\nИсточник ${URL_}\n`, 'Текст.\nИсточник', 'Источник']
    ];
    for (const [input, text, word] of cases) {
      const linked = linkTrailingSource(input);
      expect(linked.text).toBe(text);
      expect(linked.entities).toEqual([
        { type: 'text_link', offset: text.length - word.length, length: word.length, url: URL_ }
      ]);
      const post = draftFromMessageText(linked.text, linked.entities);
      expect(post.ok && post.input.entities).toEqual([
        { type: 'text_link', offset: text.length - word.length, length: word.length, url: URL_ }
      ]);
    }
  });

  it('leaves a text without a trailing link as it is', () => {
    const text = `Ссылка ${URL_} в середине.\nКонец.`;
    expect(linkTrailingSource(text)).toEqual({ text, entities: [] });
  });
});
