import { type Editor, generateJSON, getHTMLFromFragment, type JSONContent } from '@tiptap/core';
import { createEditorExtensions } from './editor-extensions';
import { docToValue, type RichValue } from './entities-doc';

// «✦ Улучшить через ИИ» (docs/design/ux/post-composer.md §4): the editor's fragment goes out as HTML, a variant
// comes back as HTML and is parsed by the editor's own schema (unknown tags flatten to text, links pass the
// editor's URL check), so a suggestion can hold exactly what the post can.

export type Fragment = {
  scope: 'selection' | 'all';
  from: number;
  to: number;
  /** The fragment as the editor serialises it now: compared again before applying. */
  html: string;
  value: RichValue;
};

const extensions = createEditorExtensions();

/** Attributes the model does not need and must not echo (`rel`, `target`, classes). */
function forModel(html: string): string {
  return html.replace(/\s(rel|target|class)="[^"]*"/g, '');
}

function sliceHtml(editor: Editor, from: number, to: number): string {
  return forModel(getHTMLFromFragment(editor.state.doc.slice(from, to).content, editor.schema));
}

/** The selection when there is one and the owner wants it, else the whole post. */
export function captureFragment(editor: Editor, preferSelection: boolean): Fragment {
  const { from, to, empty } = editor.state.selection;
  if (preferSelection && !empty) {
    const html = sliceHtml(editor, from, to);
    return { scope: 'selection', from, to, html, value: htmlToValue(html) };
  }
  const html = forModel(editor.getHTML());
  return { scope: 'all', from: 0, to: editor.state.doc.content.size, html, value: htmlToValue(html) };
}

export function hasSelection(editor: Editor): boolean {
  return (
    !editor.state.selection.empty &&
    editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to).trim() !== ''
  );
}

/** True when the text under the fragment changed since the request: applying would overwrite the owner's edit. */
export function isStale(editor: Editor, fragment: Fragment): boolean {
  if (fragment.scope === 'all') return forModel(editor.getHTML()) !== fragment.html;
  if (fragment.to > editor.state.doc.content.size) return true;
  return sliceHtml(editor, fragment.from, fragment.to) !== fragment.html;
}

export function parseSuggestion(html: string): JSONContent {
  return generateJSON(html, extensions);
}

export function htmlToValue(html: string): RichValue {
  const { issue: _issue, ...value } = docToValue(parseSuggestion(html) as Parameters<typeof docToValue>[0]);
  return value;
}

/**
 * Puts a variant in place of the fragment as one undo step. A fragment inside a paragraph takes the variant's
 * inline content, so it does not split the paragraph.
 */
export function applySuggestion(editor: Editor, fragment: Fragment, html: string): void {
  const doc = parseSuggestion(html);
  if (fragment.scope === 'all') {
    editor.chain().focus().setContent(doc).run();
    return;
  }
  const blocks = doc.content ?? [];
  const only = blocks.length === 1 ? blocks[0] : undefined;
  const content = only?.type === 'paragraph' ? (only.content ?? []) : blocks;
  editor.chain().focus().insertContentAt({ from: fragment.from, to: fragment.to }, content).run();
}
