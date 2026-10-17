import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { applySuggestion, captureFragment, htmlToValue, isStale } from '../model/ai-improve';
import { createEditorExtensions } from '../model/editor-extensions';

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

function make(html: string): Editor {
  editor = new Editor({ extensions: createEditorExtensions(), content: html });
  return editor;
}

/** Selects the first occurrence of `text` (positions inside the first paragraph only). */
function select(target: Editor, text: string): void {
  let found: { from: number; to: number } | null = null;
  target.state.doc.descendants((node, pos) => {
    if (found || !node.isText || !node.text) return;
    const index = node.text.indexOf(text);
    if (index >= 0) found = { from: pos + index, to: pos + index + text.length };
  });
  if (!found) throw new Error(`no "${text}"`);
  target.commands.setTextSelection(found);
}

describe('AI suggestion in the editor', () => {
  it('replaces only the selection, keeps the rest and its marks, inside the same paragraph', () => {
    const target = make('<p><strong>Итог:</strong> патч вышел вчера ночью, <a href="https://x.dev">ссылка</a></p>');
    select(target, 'патч вышел вчера ночью');
    const fragment = captureFragment(target, true);
    expect(fragment).toMatchObject({ scope: 'selection', html: 'патч вышел вчера ночью' });
    applySuggestion(target, fragment, '<p>патч <em>наконец</em> вышел</p>');
    expect(target.getHTML()).toBe(
      '<p><strong>Итог:</strong> патч <em>наконец</em> вышел, <a rel="noopener noreferrer nofollow" href="https://x.dev">ссылка</a></p>'
    );
    // One undo step brings the owner's text back.
    target.commands.undo();
    expect(target.getText()).toBe('Итог: патч вышел вчера ночью, ссылка');
  });

  it('replaces the whole post and parses only what a post can hold', () => {
    const target = make('<p>старый текст</p>');
    const fragment = captureFragment(target, false);
    applySuggestion(target, fragment, '<h1>Заголовок</h1><p>новый <script>alert(1)</script><u>текст</u></p>');
    expect(target.getHTML()).toBe('<p>Заголовок</p><p>новый <u>текст</u></p>');
  });

  it('knows when the text under the fragment changed since the request', () => {
    const target = make('<p>раз два три</p>');
    select(target, 'два');
    const fragment = captureFragment(target, true);
    expect(isStale(target, fragment)).toBe(false);
    target.commands.insertContentAt(1, 'ой ');
    expect(isStale(target, fragment)).toBe(true);

    const whole = captureFragment(target, false);
    expect(isStale(target, whole)).toBe(false);
    target.commands.insertContentAt(1, '!');
    expect(isStale(target, whole)).toBe(true);
  });

  it('maps a suggestion to Telegram text with entities for the preview and the counter', () => {
    expect(htmlToValue('<p><strong>Жирно</strong> и <span data-spoiler="">тайна</span></p>')).toEqual({
      body: 'Жирно и тайна',
      entities: [
        { type: 'bold', offset: 0, length: 5 },
        { type: 'spoiler', offset: 8, length: 5 }
      ]
    });
  });
});
