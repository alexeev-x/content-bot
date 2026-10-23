import { describe, expect, it } from 'vitest';
import { aiRichHtml, patchRichHtml } from './rich-post';

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
        '<tr><th colspan="2">🔴 Порезали сильнее всех</th></tr>',
        '<tr><td>Трент</td><td>интеллект 20 → 17, инвиз 2 → 1 сек</td></tr>',
        '<tr><td>Котл</td><td>Illuminate лечит 60% вместо 70%</td></tr>',
        '<tr><th colspan="2">🟢 Усилили</th></tr>',
        '<tr><td>Урса</td><td>урон от здоровья 1,25% → 1,75%</td></tr>',
        '<tr><th colspan="2">🟡 И то и другое</th></tr>',
        '<tr><td>Хускар</td><td>сила −1, зато прирост 3,3 → 3,4</td></tr>',
        '</table>',
        '<details><summary>Предметы</summary><ul><li>Капли дают на четверть меньше регена маны</li><li>Battle Fury рубит деревья раз в 3 секунды вместо 4</li></ul></details>',
        '<tg-button-row><tg-button type="url" url="https://www.dota2.com/patches/7.41f">Подробнее</tg-button></tg-button-row>'
      ].join('\n')
    );
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
    expect(aiRichHtml('Обычная новость без патча.')).toBeNull();
  });

  it('links only dota2.com: another address gives no button', () => {
    const html = patchRichHtml(PATCH.replace('https://www.dota2.com/patches/7.41f', 'https://example.com/x'));
    expect(html).not.toContain('tg-button');
  });
});
