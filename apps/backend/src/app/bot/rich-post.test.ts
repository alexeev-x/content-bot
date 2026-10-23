import { describe, expect, it } from 'vitest';
import { aiRichHtml, patchRichHtml, structuredRichHtml } from './rich-post';

const PATCH = `Вышел 7.41f.

Тренту порезали базовый интеллект, а инвиз после деревьев держится вдвое меньше.

🔴 Порезали сильнее всех
Трент — интеллект 20 → 17, инвиз 2 → 1 сек
Котл — Illuminate лечит 60% вместо 70%

🟢 Усилили
Урса — урон от здоровья 1,25% → 1,75%

🟡 И то и другое
Хускар — сила −1, зато прирост 3,3 → 3,4

Предметы
• Капли дают на четверть меньше регена маны
• Battle Fury рубит деревья раз в 3 секунды вместо 4

Все изменения — https://www.dota2.com/patches/7.41f`;

describe('patchRichHtml', () => {
  it('builds the approved patch sample: heading, media slot, main, grouped table, folded items, «Подробнее»', () => {
    expect(patchRichHtml(PATCH)).toBe(
      [
        '<h3>Вышел 7.41f</h3>',
        '{{media}}',
        '<p><b>Главное:</b> Тренту порезали базовый интеллект, а инвиз после деревьев держится вдвое меньше.</p>',
        '<table bordered compact>',
        '<tr><td colspan="2"><b>🔴 Порезали сильнее всех</b></td></tr>',
        '<tr><td>Трент</td><td>интеллект 20 → 17, инвиз 2 → 1 сек</td></tr>',
        '<tr><td>Котл</td><td>Illuminate лечит 60% вместо 70%</td></tr>',
        '<tr><td colspan="2"><b>🟢 Усилили</b></td></tr>',
        '<tr><td>Урса</td><td>урон от здоровья 1,25% → 1,75%</td></tr>',
        '<tr><td colspan="2"><b>🟡 И то и другое</b></td></tr>',
        '<tr><td>Хускар</td><td>сила −1, зато прирост 3,3 → 3,4</td></tr>',
        '</table>',
        '<details><summary>Предметы</summary><ul><li>Капли дают на четверть меньше регена маны</li><li>Battle Fury рубит деревья раз в 3 секунды вместо 4</li></ul></details>',
        '<tg-button-row><tg-button type="url" url="https://www.dota2.com/patches/7.41f">Подробнее</tg-button></tg-button-row>'
      ].join('\n')
    );
  });

  it('marks each group by its words: buffed is always green, whatever the writer put before it', () => {
    // DEV 23.10.2026: the writer wrote «🔺 Усилили», and the owner saw a red buff group.
    const html = patchRichHtml(
      PATCH.replace('🟢 Усилили', '🔺 Усилили:')
        .replace('🔴 Порезали', '🔻 Порезали')
        .replace('🟡 И то и другое', '⚖️ Почти не изменили')
    );
    expect(html).toContain('<td colspan="2"><b>🟢 Усилили</b></td>');
    expect(html).toContain('<td colspan="2"><b>🔴 Порезали сильнее всех</b></td>');
    expect(html).toContain('<td colspan="2"><b>🟡 Почти не изменили</b></td>');
    expect(html).not.toContain('🔺');
  });

  it('escapes the text, so a «<» in a post never becomes markup', () => {
    const html = patchRichHtml(PATCH.replace('Котл — Illuminate', 'Котл — <mark>Illuminate & co'));
    expect(html).toContain('<td>&lt;mark&gt;Illuminate &amp; co лечит 60% вместо 70%</td>');
    expect(html).not.toContain('<mark>');
  });

  it('never turns the text’s own «{{media}}» into the picture slot, and keeps a sentence with an address in it', () => {
    const html =
      patchRichHtml(
        PATCH.replace('Котл — Illuminate', 'Котл — {{media}} Illuminate').replace(
          'Тренту порезали базовый интеллект',
          'Тренту порезали интеллект, подробнее на https://www.dota2.com/patches/7.41f — и это больно'
        )
      ) ?? '';
    expect(html.split('{{media}}')).toHaveLength(2);
    expect(html).toContain('<td>&#123;&#123;media}} Illuminate');
    expect(html).toContain('подробнее на https://www.dota2.com/patches/7.41f — и это больно');
  });

  it('gives null for text without the structure, so the post goes out as before', () => {
    expect(patchRichHtml('Вышел 7.41f.\n\nТренту порезали интеллект. Лине тоже досталось.')).toBeNull();
    expect(patchRichHtml('Габен вернул аркану на дровку.')).toBeNull();
    expect(aiRichHtml('Обычная новость без патча.', true)).toBeNull();
    expect(aiRichHtml(PATCH, false)).toBeNull();
  });

  it('links only dota2.com: another address gives no button', () => {
    const html = patchRichHtml(PATCH.replace('https://www.dota2.com/patches/7.41f', 'https://example.com/x'));
    expect(html).not.toContain('tg-button');
  });
});

describe('structuredRichHtml', () => {
  it('builds a hotfix post: heading, slot, paragraph, list, a folded block and «Подробнее»', () => {
    const text = [
      'Обновление 1 июля: карнавал щедрее',
      '',
      'Valve выпустила мелкий фикс, но для карнавала он важный:',
      '',
      '• за обычные игры дают 2 металлолома, за турбо — 1',
      '• Seeing Stones можно получить в коопе с ботами',
      '',
      '▾ Остальные исправления',
      '• Билеты снова дают за Ability Draft',
      '• Пироги больше не выдают иллюзию',
      '',
      'https://www.dota2.com/newsentry/670621050832160174'
    ].join('\n');
    expect(structuredRichHtml(text)).toBe(
      [
        '<h3>Обновление 1 июля: карнавал щедрее</h3>',
        '{{media}}',
        '<p>Valve выпустила мелкий фикс, но для карнавала он важный:</p>',
        '<ul><li>за обычные игры дают 2 металлолома, за турбо — 1</li><li>Seeing Stones можно получить в коопе с ботами</li></ul>',
        '<details><summary>Остальные исправления</summary><ul><li>Билеты снова дают за Ability Draft</li><li>Пироги больше не выдают иллюзию</li></ul></details>',
        '<tg-button-row><tg-button type="url" url="https://www.dota2.com/newsentry/670621050832160174">Подробнее</tg-button></tg-button-row>'
      ].join('\n')
    );
  });

  it('makes «А — Б» lines a table, with a «Колонка | Колонка» head', () => {
    const html = structuredRichHtml(
      [
        'Пять личностей-автоматонов',
        '',
        'Морф теперь из стали.',
        '',
        'Герой | Какой он теперь',
        'Axe — двигатель ярости',
        'Oracle — заводной пророк'
      ].join('\n')
    );
    expect(html).toContain(
      '<table bordered striped compact><tr><th>Герой</th><th>Какой он теперь</th></tr><tr><td>Axe</td><td>двигатель ярости</td></tr><tr><td>Oracle</td><td>заводной пророк</td></tr></table>'
    );
  });

  it('gives null when the first line is a sentence, not a heading', () => {
    expect(structuredRichHtml('Габен вернул аркану на дровку.\n\nВнутри 15 сетов.')).toBeNull();
    expect(structuredRichHtml('Габен вернул аркану на дровку и добавил новую на тайда\nВнутри 15 сетов.')).toBeNull();
  });
});

describe('sections', () => {
  it('makes a «Раздел:» line above its points a heading, so a post is never a wall of text', () => {
    const html = structuredRichHtml(
      [
        'Обновление 1 июля',
        '',
        'Главное коротко.',
        '',
        'Из заметного по механикам:',
        '• Глиф без True Strike',
        '• Пироги без подсказки'
      ].join('\n')
    );
    expect(html).toContain(
      '<h4>Из заметного по механикам</h4>\n<ul><li>Глиф без True Strike</li><li>Пироги без подсказки</li></ul>'
    );
    // A sentence that only ends with a colon and has nothing under it stays a paragraph.
    expect(structuredRichHtml('Обновление\n\nВот что вышло:')).toContain('<p>Вот что вышло:</p>');
  });
});
