import type { PostDto } from '@alexeev/contracts';
import { useRef, useState } from 'react';
import { Banner, Button, ConfirmDialog, Dialog } from '../../../shared/ui';
import { useClosingConfirmation } from '../../../shared/telegram/use-closing-confirmation';
import { usePostEditor } from '../model/use-post-editor';
import { postsCopy } from './copy';
import { PostFields } from './PostFields';
import { PostPreview } from './PostPreview';
import styles from './QuickPostDialog.module.css';

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** The server confirmed the draft; the dialog has closed itself. */
  onSaved: (post: PostDto) => void;
  /** Same, but the operator asked to continue in the full editor. */
  onSavedAndOpen: (post: PostDto) => void;
};

const copy = postsCopy.quick;
const editorCopy = postsCopy.editor;

/** Opening mounts a fresh form: text typed before a cancelled attempt never leaks into the next one. */
export function QuickPostDialog(props: Props) {
  return props.isOpen ? <QuickPostFlow {...props} /> : null;
}

function QuickPostFlow({ onOpenChange, onSaved, onSavedAndOpen }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(false);
  const editor = usePostEditor({ rootRef, dirtyRef });
  const [confirmOpen, setConfirmOpen] = useState(false);
  useClosingConfirmation(editor.dirty);

  async function submit(after: (post: PostDto) => void) {
    const saved = await editor.save();
    if (saved === null) return;
    onOpenChange(false);
    after(saved);
  }

  function requestClose(open: boolean) {
    if (open) return;
    if (editor.dirty && !editor.isSaving) setConfirmOpen(true);
    else onOpenChange(false);
  }

  const { notice } = editor;
  return (
    <>
      <Dialog
        isOpen
        onOpenChange={requestClose}
        title={copy.title}
        description={copy.description}
        size="wide"
        footer={
          <>
            <Button variant="secondary" isDisabled={editor.isSaving} onPress={() => requestClose(false)}>
              {copy.cancel}
            </Button>
            <Button variant="secondary" isDisabled={editor.isSaving} onPress={() => void submit(onSavedAndOpen)}>
              {copy.openInEditor}
            </Button>
            <Button icon="check" isLoading={editor.isSaving} onPress={() => void submit(onSaved)}>
              {copy.saveDraft}
            </Button>
          </>
        }
      >
        <div ref={rootRef} className={styles.layout}>
          <div className={styles.notice}>
            {notice ? (
              <Banner tone="error" title={notice.title} onDismiss={editor.dismissNotice}>
                {notice.message}
                {notice.requestId ? (
                  <>
                    {' '}
                    {editorCopy.errors.requestId}: <code>{notice.requestId}</code>
                  </>
                ) : null}
              </Banner>
            ) : null}
            <PostFields
              control={editor.form.control}
              setValue={editor.form.setValue}
              title={editor.title}
              body={editor.body}
              entities={editor.entities}
              isReadOnly={false}
              isNew
              length={editor.length}
              overflow={editor.overflow}
            />
          </div>
          <PostPreview title={editor.title} body={editor.body} entities={editor.entities} length={editor.length} />
        </div>
      </Dialog>
      <ConfirmDialog
        isOpen={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={editorCopy.leave.title}
        description={editorCopy.leave.description}
        confirmLabel={editorCopy.leave.confirm}
        cancelLabel={editorCopy.leave.cancel}
        onConfirm={() => onOpenChange(false)}
      />
    </>
  );
}
