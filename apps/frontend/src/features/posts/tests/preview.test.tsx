import type { PostEntity } from '@alexeev/contracts';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { PostPreview } from '../ui/PostPreview';

afterEach(cleanup);

function preview(title: string, body: string, entities: PostEntity[]) {
  render(<PostPreview title={title} body={body} entities={entities} length={body.length} />);
  return screen.getByRole('figure', { name: 'Предпросмотр в Telegram' });
}

describe('PostPreview entities', () => {
  it('shows the bold title, a blank line and the body in the order Telegram sends them', () => {
    const bubble = preview(' Заголовок ', 'текст', []);
    expect(within(bubble).getByText('Заголовок').tagName).toBe('STRONG');
    expect(bubble.textContent).toContain('Заголовок\n\nтекст');
  });

  it('renders every supported entity as its own element', () => {
    const body = 'bold italic under strike code link\nshell\nquoted';
    const at = (word: string) => body.indexOf(word);
    const entities: PostEntity[] = [
      { type: 'bold', offset: at('bold'), length: 4 },
      { type: 'italic', offset: at('italic'), length: 6 },
      { type: 'underline', offset: at('under'), length: 5 },
      { type: 'strikethrough', offset: at('strike'), length: 6 },
      { type: 'code', offset: at('code'), length: 4 },
      { type: 'text_link', offset: at('link'), length: 4, url: 'https://example.com/a' },
      { type: 'pre', offset: at('shell'), length: 5, language: 'sh' },
      { type: 'blockquote', offset: at('quoted'), length: 6 }
    ];
    const bubble = preview('T', body, entities);
    expect(within(bubble).getByText('bold').tagName).toBe('STRONG');
    expect(within(bubble).getByText('italic').tagName).toBe('EM');
    expect(within(bubble).getByText('under').tagName).toBe('U');
    expect(within(bubble).getByText('strike').tagName).toBe('S');
    expect(within(bubble).getByText('code').tagName).toBe('CODE');
    const link = within(bubble).getByRole('link', { name: 'link' });
    expect(link.getAttribute('href')).toBe('https://example.com/a');
    expect(link.getAttribute('rel')).toBe('noreferrer noopener');
    expect(bubble.querySelector('pre')?.getAttribute('data-language')).toBe('sh');
    expect(bubble.querySelector('pre')?.textContent).toBe('shell');
    expect(bubble.querySelector('blockquote')?.textContent).toBe('quoted');
  });

  it('counts the title and emoji in UTF-16 units when it moves the body entities', () => {
    const bubble = preview('Тема 😀', '👍 жирный', [{ type: 'bold', offset: 3, length: 6 }]);
    const strong = within(bubble).getAllByText(/жирный|Тема/);
    expect(strong.map((node) => node.textContent)).toEqual(['Тема 😀', 'жирный']);
  });

  it('nests entities', () => {
    const bubble = preview('', 'ab', [
      { type: 'bold', offset: 0, length: 2 },
      { type: 'italic', offset: 0, length: 1 }
    ]);
    expect(bubble.querySelector('strong > em')?.textContent).toBe('a');
  });

  it('hides a spoiler until it is pressed, and the press is reversible and keyboard operable', async () => {
    const user = userEvent.setup();
    const bubble = preview('', 'тайна', [{ type: 'spoiler', offset: 0, length: 5 }]);
    const spoiler = within(bubble).getByRole('button', { name: 'Скрытый текст, нажмите, чтобы показать' });
    expect(spoiler.getAttribute('aria-pressed')).toBe('false');
    await user.tab();
    await user.keyboard('{Enter}');
    expect(within(bubble).getByRole('button', { name: 'тайна' }).getAttribute('aria-pressed')).toBe('true');
    await user.keyboard('{Enter}');
    expect(within(bubble).getByRole('button').getAttribute('aria-pressed')).toBe('false');
  });

  it('does not add an empty line after a quote or a code block', () => {
    const bubble = preview('', 'q\nafter', [{ type: 'blockquote', offset: 0, length: 1 }]);
    const quote = bubble.querySelector('blockquote');
    expect(quote?.nextSibling?.textContent).toBe('after');
  });

  it('shows markup characters literally and never makes HTML of them', () => {
    const bubble = preview('', '<b>x</b> & <img src=x>', []);
    expect(bubble.querySelector('b, img')).toBeNull();
    expect(within(bubble).getByText('<b>x</b> & <img src=x>')).toBeTruthy();
  });

  it('never renders a link whose address is not http(s) or tg', () => {
    const bubble = preview('', 'click', [{ type: 'text_link', offset: 0, length: 5, url: 'javascript:alert(1)' }]);
    expect(bubble.querySelector('a')).toBeNull();
    expect(within(bubble).getByText('click')).toBeTruthy();
  });

  it('survives entities that no longer fit the text while the operator edits', () => {
    const bubble = preview('', 'ab', [{ type: 'bold', offset: 1, length: 40 }]);
    expect(bubble.textContent).toContain('ab');
  });

  it('shows the placeholder for an empty post', () => {
    const bubble = preview('', '', []);
    expect(within(bubble).getByText('Здесь появится ваш пост')).toBeTruthy();
  });
});

describe('PostPreview split pieces', () => {
  it('renders staggered styles character for character like the unsplit marks', () => {
    // bold[0,4), italic[2,4) and italic[4,6): the split form of bold over «abcd», italic over «cdef».
    const bubble = preview('', 'abcdef', [
      { type: 'bold', offset: 0, length: 4 },
      { type: 'italic', offset: 2, length: 2 },
      { type: 'italic', offset: 4, length: 2 }
    ]);
    const styleOf = (node: Node): string[] => {
      const names: string[] = [];
      for (let el = node.parentElement; el && el !== bubble; el = el.parentElement) {
        if (['STRONG', 'EM'].includes(el.tagName)) names.push(el.tagName);
      }
      return names.sort();
    };
    const walker = document.createTreeWalker(bubble, NodeFilter.SHOW_TEXT);
    const perCharacter: string[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!/^[a-f]+$/.test(node.textContent ?? '')) continue;
      for (const _ of node.textContent ?? '') perCharacter.push(styleOf(node).join('+'));
    }
    expect(perCharacter).toEqual(['STRONG', 'STRONG', 'EM+STRONG', 'EM+STRONG', 'EM', 'EM']);
    expect(bubble.textContent).toContain('abcdef');
  });
});
