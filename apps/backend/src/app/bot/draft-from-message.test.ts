import { describe, expect, it } from 'vitest';
import { aiPostText, draftFromMessageText, linkTrailingSource } from './draft-from-message';

const URL_ = 'https://www.dota2.com/newsentry/681888927386174386';
const PAGE = 'https://www.dota2.com/darkcarnival';

// Each case: the AI text, the post text, and the linked words with their URLs in order.
const CASES: [string, string, [string, string][]][] = [
  [
    `Габен 🦈 вернул аркану.\n\nПодробности: ${URL_}`,
    'Габен 🦈 вернул аркану.\n\nПодробности',
    [['Подробности', URL_]]
  ],
  [`Текст.\n\n${URL_}`, 'Текст.\n\nПодробнее', [['Подробнее', URL_]]],
  [`Наборы тут.\nПосмотреть наборы: ${PAGE}`, 'Наборы тут.\nПосмотреть наборы', [['Посмотреть наборы', PAGE]]],
  [
    `Как это выглядит в игре, смотрите на видео:\n${PAGE}`,
    'Как это выглядит в игре, смотрите на видео',
    [['Как это выглядит в игре, смотрите на видео', PAGE]]
  ],
  [
    `Читай ${URL_} и думай, а потом ${PAGE} тоже.`,
    'Читай ссылка и думай, а потом ссылка тоже.',
    [
      ['ссылка', URL_],
      ['ссылка', PAGE]
    ]
  ],
  [
    `Первое: ${URL_}\nВторое.\nВсе подробности: ${PAGE}`,
    'Первое\nВторое.\nВсе подробности',
    [
      ['Первое', URL_],
      ['Все подробности', PAGE]
    ]
  ]
];

describe('linkTrailingSource', () => {
  it('hides every address behind its words, with UTF-16 offsets the post keeps', () => {
    for (const [input, text, words] of CASES) {
      const linked = linkTrailingSource(input);
      expect(linked.text).toBe(text);
      let from = 0;
      const expected = words.map(([word, url]) => {
        const offset = text.indexOf(word, from);
        from = offset + word.length;
        return { type: 'text_link', offset, length: word.length, url };
      });
      expect(linked.entities).toEqual(expected);
      const post = draftFromMessageText(linked.text, linked.entities);
      expect(post.ok && post.input.entities).toEqual(expected);
    }
  });

  it('leaves a text without an address as it is', () => {
    const text = 'Без ссылок.\nКонец.';
    expect(linkTrailingSource(text)).toEqual({ text, entities: [] });
  });
});

describe('a patch post from an AI text', () => {
  it('opens with «Вышел <версия>.» in bold on its own line, then an empty line, whatever the writer did', () => {
    for (const text of ['Вышел 7.41f. Тренту порезали интеллект.', 'Вышел 7.41f.\nТренту порезали интеллект.']) {
      expect(aiPostText(text)).toEqual({
        text: 'Вышел 7.41f.\n\nТренту порезали интеллект.',
        entities: [{ type: 'bold', offset: 0, length: 12 }]
      });
    }
    // Any other post keeps its first line as written (owner, 16.10.2026: no bold title).
    expect(aiPostText('Вышел новый сет на Пуджа.\n\nКрасивый.').entities).toEqual([]);
  });
});

describe('a find in the game files from an AI text', () => {
  // Owner, 24.10.2026: what was removed and added shows red and green, as a diff in Telegram.
  it('turns the «```diff» block into Telegram code in the diff language and drops its fences', () => {
    const post = aiPostText(
      [
        'В файлах игры нашли тихий нерф Kez.',
        '',
        '```diff',
        '- Вампиризм: 40/80/120/160',
        '+ Вампиризм: 30/60/90/120',
        '```',
        'Подробнее: https://www.dota2.com/x'
      ].join('\n')
    );
    const block = '- Вампиризм: 40/80/120/160\n+ Вампиризм: 30/60/90/120';
    expect(post.text).toBe(`В файлах игры нашли тихий нерф Kez.\n\n${block}\nПодробнее`);
    const offset = post.text.indexOf(block);
    expect(post.entities).toEqual([
      { type: 'pre', offset, length: block.length, language: 'diff' },
      {
        type: 'text_link',
        offset: post.text.indexOf('Подробнее'),
        length: 'Подробнее'.length,
        url: 'https://www.dota2.com/x'
      }
    ]);
  });

  it('leaves an unclosed fence as text', () => {
    expect(aiPostText('Текст.\n```diff\n+ строка').entities).toEqual([]);
  });
});
