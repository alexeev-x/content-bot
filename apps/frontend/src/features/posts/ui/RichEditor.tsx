import type { PostEntity } from '@alexeev/contracts';
import { EditorContent } from '@tiptap/react';
import { useEffect, useId, useState } from 'react';
import { ru } from '../../../shared/lib/ru';
import { Button, VisuallyHidden } from '../../../shared/ui';
import type { RichValue } from '../model/entities-doc';
import { parseLinkInput } from '../model/link-url';
import { useRichEditor } from '../model/use-rich-editor';
import { AiImproveDialog } from './AiImproveDialog';
import { CodeLanguageDialog } from './CodeLanguageDialog';
import { postsCopy } from './copy';
import { EditorToolbar } from './EditorToolbar';
import { LinkDialog, type LinkDialogStart } from './LinkDialog';
import styles from './RichEditor.module.css';

type Props = {
  label: string;
  description?: string | undefined;
  /** Body text and its entities: the canonical value, never HTML. */
  body: string;
  entities: PostEntity[];
  onChange: (value: RichValue) => void;
  onBlur?: (() => void) | undefined;
  isReadOnly?: boolean | undefined;
  errorMessage?: string | undefined;
  limit: number;
  /** The label stays only for assistive technology (the field names itself through `aria-label` anyway). */
  hideLabel?: boolean | undefined;
  /** Puts the caret in the field once it is ready (a fresh draft: the owner came here to write). */
  autoFocus?: boolean | undefined;
};

/** Rich text field for a Telegram post. The toolbar is hidden while the field is read-only. */
export function RichEditor({
  label,
  description,
  body,
  entities,
  onChange,
  onBlur,
  isReadOnly = false,
  errorMessage,
  limit,
  hideLabel = false,
  autoFocus = false
}: Props) {
  const id = useId();
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const [linkStart, setLinkStart] = useState<LinkDialogStart | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [improveOpen, setImproveOpen] = useState(false);
  const canImprove = body.trim() !== '';

  const editor = useRichEditor({
    value: { body, entities },
    onChange,
    onBlur,
    onLinkShortcut: () => openLink(),
    isReadOnly,
    attributes: {
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-label': label,
      'aria-describedby': errorMessage ? `${descriptionId} ${errorId}` : descriptionId,
      ...(errorMessage ? { 'aria-invalid': 'true' } : {}),
      ...(isReadOnly ? { 'aria-readonly': 'true' } : {}),
      spellcheck: 'true'
    }
  });

  // Once, when the editor exists: syncing focus with the external editor instance.
  useEffect(() => {
    if (autoFocus && editor && !isReadOnly) editor.commands.focus('end');
  }, [autoFocus, editor, isReadOnly]);

  function openLink() {
    if (!editor || isReadOnly) return;
    const isLink = editor.isActive('link');
    const { from, to } = editor.state.selection;
    setLinkStart({
      href: typeof editor.getAttributes('link').href === 'string' ? (editor.getAttributes('link').href as string) : '',
      hasText: isLink || from !== to,
      isLink
    });
  }

  function applyLink({ href, text }: { href: string; text: string | null }) {
    if (!editor) return;
    // The address was already validated by the dialog; the same function is the editor's last gate.
    const parsed = parseLinkInput(href);
    if (!parsed.ok) return;
    if (text === null) editor.chain().focus().extendMarkRange('link').setLink({ href: parsed.href }).run();
    else {
      editor
        .chain()
        .focus()
        .insertContent({ type: 'text', text, marks: [{ type: 'link', attrs: { href: parsed.href } }] })
        .run();
    }
    setLinkStart(null);
  }

  function removeLink() {
    editor?.chain().focus().extendMarkRange('link').unsetLink().run();
    setLinkStart(null);
  }

  function applyLanguage(next: string | null) {
    editor?.chain().focus().updateAttributes('codeBlock', { language: next }).run();
    setLanguage(null);
  }

  return (
    <div className={styles.field}>
      <span className={styles.label}>
        {hideLabel ? <VisuallyHidden>{label}</VisuallyHidden> : <span>{label}</span>}
        <span className={`${styles.labelCounter} mono`}>{ru.ui.counter(body.length, limit)}</span>
      </span>
      <div className={styles.box} data-invalid={errorMessage ? '' : undefined} data-readonly={isReadOnly || undefined}>
        {editor && !isReadOnly ? (
          <EditorToolbar
            editor={editor}
            onLink={openLink}
            onCodeLanguage={() => setLanguage(String(editor.getAttributes('codeBlock').language ?? ''))}
          />
        ) : null}
        <EditorContent editor={editor} className={styles.content} />
      </div>
      <div className={styles.footer}>
        {editor && !isReadOnly ? (
          <Button
            variant="ghost"
            size="sm"
            icon="sparkle"
            isDisabled={!canImprove}
            aria-describedby={canImprove ? undefined : `${id}-ai-hint`}
            onPress={() => setImproveOpen(true)}
          >
            {postsCopy.ai.button}
          </Button>
        ) : null}
        {editor && !isReadOnly && !canImprove ? (
          <span id={`${id}-ai-hint`} className={styles.aiHint}>
            {postsCopy.ai.emptyHint}
          </span>
        ) : null}
        <p id={descriptionId} className={styles.description}>
          <VisuallyHidden>{description}</VisuallyHidden>
          <span className={`mono ${body.length > limit ? styles.over : ''}`}>{ru.ui.counter(body.length, limit)}</span>
        </p>
      </div>
      <p id={errorId} className={styles.error} role={errorMessage ? 'alert' : undefined}>
        {errorMessage}
      </p>
      {linkStart ? (
        <LinkDialog start={linkStart} onApply={applyLink} onRemove={removeLink} onClose={() => setLinkStart(null)} />
      ) : null}
      {editor && improveOpen ? (
        <AiImproveDialog editor={editor} isOpen={improveOpen} onOpenChange={setImproveOpen} limit={limit} />
      ) : null}
      {language !== null ? (
        <CodeLanguageDialog language={language} onApply={applyLanguage} onClose={() => setLanguage(null)} />
      ) : null}
    </div>
  );
}
