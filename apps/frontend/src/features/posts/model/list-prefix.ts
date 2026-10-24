import type { Editor } from '@tiptap/core';

export type ListKind = 'bullet' | 'numbered';

const BULLET = '• ';
const NUMBERED = /^\d+\. /;

/** The text a list line starts with. Telegram has no list entity: a list is just these characters in the text. */
const prefixOf = (kind: ListKind, index: number) => (kind === 'bullet' ? BULLET : `${index + 1}. `);

function existingPrefix(kind: ListKind, text: string): string | null {
  if (kind === 'bullet') return text.startsWith(BULLET) ? BULLET : null;
  return NUMBERED.exec(text)?.[0] ?? null;
}

/**
 * Adds the list prefix to every selected paragraph, or removes it when all of them already have it. Code blocks
 * are skipped: their text is literal. Numbers restart at 1 for the selection.
 */
export function toggleListPrefix(editor: Editor, kind: ListKind): boolean {
  return editor.commands.command(({ tr, state, dispatch }) => {
    const lines: Array<{ start: number; text: string }> = [];
    state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos) => {
      if (node.type.name === 'paragraph') {
        lines.push({ start: pos + 1, text: node.textContent });
        return false;
      }
      return node.type.name === 'blockquote';
    });
    if (lines.length === 0) return false;
    if (!dispatch) return true;

    const allPrefixed = lines.every((line) => existingPrefix(kind, line.text) !== null);
    // Back to front, so earlier positions stay valid while the text around them changes.
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      if (line === undefined) continue;
      const current = existingPrefix(kind, line.text);
      if (allPrefixed && current !== null) tr.delete(line.start, line.start + current.length);
      else if (!allPrefixed) {
        // A line of the other list kind loses its old prefix first, so «• » never ends up as «• 1. ».
        const other = existingPrefix(kind === 'bullet' ? 'numbered' : 'bullet', line.text);
        if (other !== null) tr.delete(line.start, line.start + other.length);
        if (current === null) tr.insert(line.start, state.schema.text(prefixOf(kind, index)));
      }
    }
    return true;
  });
}
