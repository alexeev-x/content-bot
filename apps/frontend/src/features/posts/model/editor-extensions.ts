import { mergeAttributes, Mark, type Extensions } from '@tiptap/core';
import { Blockquote } from '@tiptap/extension-blockquote';
import { Bold } from '@tiptap/extension-bold';
import { Code } from '@tiptap/extension-code';
import { CodeBlock } from '@tiptap/extension-code-block';
import { Document } from '@tiptap/extension-document';
import { Italic } from '@tiptap/extension-italic';
import { Link } from '@tiptap/extension-link';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Strike } from '@tiptap/extension-strike';
import { Text } from '@tiptap/extension-text';
import { Underline } from '@tiptap/extension-underline';
import { UndoRedo } from '@tiptap/extensions';
import { normalizeLinkUrl } from './link-url';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    spoiler: {
      toggleSpoiler: () => ReturnType;
    };
  }
}

// Telegram has no equivalent of «hidden text» in HTML, so it is a mark of our own that maps to the `spoiler` entity.
const Spoiler = Mark.create({
  name: 'spoiler',
  parseHTML: () => [{ tag: 'span[data-spoiler]' }, { tag: 'tg-spoiler' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { 'data-spoiler': '' }), 0],
  addCommands() {
    return {
      toggleSpoiler:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name)
    };
  },
  addKeyboardShortcuts() {
    return { 'Mod-Shift-p': () => this.editor.commands.toggleSpoiler() };
  }
});

/**
 * The editor can produce only what a Telegram message can hold: no headings, lists, images, rules or line-break
 * nodes. Anything pasted that has no schema entry here is flattened to its text by ProseMirror's parser.
 * A quote may hold paragraphs and code blocks but not another quote (Telegram refuses nested quotes).
 * Shortcuts: Ctrl/Cmd+B bold, I italic, U underline, Shift+X strikethrough, Shift+P spoiler, E inline code,
 * Alt+C code block, Shift+9 quote; K (link) is handled by the editor component because it opens a dialog.
 */
export function createEditorExtensions(): Extensions {
  return [
    Document.extend({ content: '(paragraph | codeBlock | blockquote)+' }),
    Paragraph,
    Text,
    Bold,
    Italic,
    Underline,
    Strike.extend({
      addKeyboardShortcuts() {
        return { 'Mod-Shift-x': () => this.editor.commands.toggleStrike() };
      }
    }),
    Spoiler,
    Code,
    // Tab indentation stays off so Tab always leaves the editor (no keyboard trap).
    CodeBlock.configure({ enableTabIndentation: false }),
    Blockquote.extend({
      content: '(paragraph | codeBlock)+',
      addKeyboardShortcuts() {
        return { 'Mod-Shift-9': () => this.editor.commands.toggleBlockquote() };
      }
    }),
    Link.configure({
      openOnClick: false,
      // Telegram links bare addresses itself; turning typed text into entities would send marks nobody chose.
      autolink: false,
      linkOnPaste: false,
      protocols: ['tg'],
      isAllowedUri: (url) => normalizeLinkUrl(url) !== null,
      HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: null }
    }),
    UndoRedo
  ];
}
