import { useEditor } from '@tiptap/react';
import { useEffect, useMemo, useRef } from 'react';
import { docToValue, valueToDoc, type RichValue } from './entities-doc';
import { createEditorExtensions } from './editor-extensions';

type Options = {
  value: RichValue;
  onChange: (value: RichValue) => void;
  onBlur?: (() => void) | undefined;
  /** Ctrl/Cmd+K: the component owns the dialog. */
  onLinkShortcut: () => void;
  isReadOnly: boolean;
  /** Attributes of the editable element: name, description, validity. */
  attributes: Record<string, string>;
};

const keyOf = (value: RichValue) => `${value.body}\u0000${JSON.stringify(value.entities)}`;

/**
 * TipTap editor bound to a value. It emits the mapped value on every user edit, and takes a new document only when
 * the value was changed from outside (reset to the server version): the editor's own output never loops back.
 */
export function useRichEditor({ value, onChange, onBlur, onLinkShortcut, isReadOnly, attributes }: Options) {
  const latest = useRef({ onChange, onBlur, onLinkShortcut });
  useEffect(() => {
    latest.current = { onChange, onBlur, onLinkShortcut };
  });
  const emitted = useRef(keyOf(value));
  const extensions = useMemo(() => createEditorExtensions(), []);

  const editor = useEditor({
    extensions,
    content: valueToDoc(value),
    editable: !isReadOnly,
    injectCSS: false,
    editorProps: {
      attributes,
      handleKeyDown: (_view, event) => {
        const isLinkKey =
          (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'k';
        if (!isLinkKey) return false;
        event.preventDefault();
        latest.current.onLinkShortcut();
        return true;
      }
    },
    onUpdate: ({ editor: current }) => {
      const { issue: _issue, ...mapped } = docToValue(current.getJSON());
      emitted.current = keyOf(mapped);
      latest.current.onChange(mapped);
    },
    onBlur: () => latest.current.onBlur?.()
  });

  const key = keyOf(value);
  useEffect(() => {
    if (!editor || key === emitted.current) return;
    emitted.current = key;
    editor.commands.setContent(valueToDoc(value), { emitUpdate: false });
    // `value` is read through `key`: it changes exactly when the content does.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, key]);

  useEffect(() => {
    editor?.setEditable(!isReadOnly);
  }, [editor, isReadOnly]);

  const attributesKey = JSON.stringify(attributes);
  useEffect(() => {
    editor?.setOptions({ editorProps: { ...editor.options.editorProps, attributes } });
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, attributesKey]);

  return editor;
}
