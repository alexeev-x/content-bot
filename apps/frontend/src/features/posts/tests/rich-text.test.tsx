import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RichText } from '../ui/RichText';

describe('RichText', () => {
  it('shows the approved sample: heading, table, folded block and «Подробнее», without the media slot', () => {
    const { container } = render(
      <RichText
        html={[
          '<h3>Вышел 7.41f</h3>',
          '{{media}}',
          '<p><b>Главное:</b> Тренту порезали интеллект.</p>',
          '<table bordered compact><tr><th colspan="2">🔴 Порезали сильнее всех</th></tr><tr><td>Трент</td><td>20 → 17</td></tr></table>',
          '<details><summary>Предметы</summary><ul><li>Капли</li></ul></details>',
          '<tg-button-row><tg-button type="url" url="https://www.dota2.com/patches/7.41f">Подробнее</tg-button></tg-button-row>'
        ].join('\n')}
      />
    );
    screen.getByText('Вышел 7.41f');
    screen.getByRole('table');
    expect(screen.getByRole('columnheader', { name: '🔴 Порезали сильнее всех' }).getAttribute('colspan')).toBe('2');
    screen.getByText('Предметы');
    expect(screen.getByRole('link', { name: 'Подробнее' }).getAttribute('href')).toBe(
      'https://www.dota2.com/patches/7.41f'
    );
    expect(container.textContent).not.toContain('{{media}}');
  });

  it('never turns other markup into elements: a script or an attribute stays out', () => {
    const { container } = render(
      <RichText
        html={
          '<p onclick="alert(1)">Текст</p><script>alert(2)</script><img src=x onerror="alert(3)"><a href="javascript:alert(4)">ссылка</a>'
        }
      />
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[onclick]')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('Текст');
  });
});
