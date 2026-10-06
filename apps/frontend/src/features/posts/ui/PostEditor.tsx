import type { PostDto } from '@alexeev/contracts';
import { useNavigate } from '@tanstack/react-router';
import { useRef, useState, type ReactNode } from 'react';
import {
  Banner,
  Button,
  ConfirmDialog,
  Icon,
  StatusBadge,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  useMediaQuery,
  VisuallyHidden
} from '../../../shared/ui';
import { useLeaveGuard } from '../model/use-leave-guard';
import { usePostEditor } from '../model/use-post-editor';
import { useSaveShortcut } from '../model/use-save-shortcut';
import { CompareDialog } from './CompareDialog';
import { ConflictBanner } from './ConflictBanner';
import { postsCopy } from './copy';
import { PostFields } from './PostFields';
import { PostPreview } from './PostPreview';
import styles from './PostEditor.module.css';
import { SaveIndicator } from './SaveIndicator';

type Props = {
  /** Server post of an existing record; omit for a new draft. */
  post?: PostDto | undefined;
  onCreated?: ((post: PostDto) => void) | undefined;
  /** The primary action of an approved post (publish). Composed by the page: features never import each other. */
  approvedActions?: ((post: PostDto) => ReactNode) | undefined;
  /** Extra cards under the preview (this post's publications). */
  aside?: ReactNode;
};

const copy = postsCopy.editor;
const NARROW = '(max-width: 859px)';

export function PostEditor({ post, onCreated, approvedActions, aside }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(false);
  const editor = usePostEditor({ post, onCreated, rootRef, dirtyRef });
  const { baseline, conflict, notice } = editor;
  const narrow = useMediaQuery(NARROW);
  const navigate = useNavigate();
  const blocker = useLeaveGuard(dirtyRef);
  const statusRef = useRef<HTMLDivElement>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [overwriteOpen, setOverwriteOpen] = useState(false);

  useSaveShortcut(() => void editor.save());

  const isApproved = baseline?.status === 'approved';
  const hasConflict = conflict !== null;
  const canSave = !editor.readOnly && !hasConflict && (editor.isNew || editor.dirty);
  const canApprove = !editor.isNew && !editor.readOnly && !hasConflict && editor.overflow === 0;

  async function confirmApprove() {
    const approved = await editor.approvePost();
    setApproveOpen(false);
    // The button that opened the dialog is gone after approval: move focus to the announced status.
    if (approved) statusRef.current?.focus();
  }

  async function confirmOverwrite() {
    await editor.overwrite();
    setOverwriteOpen(false);
  }

  const fields = (
    <PostFields
      control={editor.form.control}
      title={editor.title}
      isReadOnly={editor.readOnly}
      isNew={editor.isNew}
      length={editor.length}
      overflow={editor.overflow}
    />
  );
  const preview = (
    <div className={styles.previewColumn}>
      <PostPreview title={editor.title} body={editor.body} length={editor.length} />
      {aside}
    </div>
  );

  return (
    <div ref={rootRef} className={styles.editor}>
      <div ref={statusRef} tabIndex={-1} className={styles.meta}>
        <StatusBadge status={baseline?.status ?? 'draft'} />
        {baseline ? (
          <>
            <span className={`mono ${styles.muted}`}>{copy.revision(baseline.revision)}</span>
          </>
        ) : null}
        <SaveIndicator state={editor.saveState} savedAt={baseline?.updatedAt} />
        <VisuallyHidden>
          <output>{editor.justApproved ? copy.approved.announce : ''}</output>
        </VisuallyHidden>
      </div>

      {conflict ? (
        <ConflictBanner
          conflict={conflict}
          isBusy={editor.isSaving || editor.isApproving}
          onShowServer={() => setCompareOpen(true)}
          onOverwrite={() => setOverwriteOpen(true)}
          onRetry={editor.retryServerVersion}
        />
      ) : null}
      {notice ? (
        <Banner tone="error" title={notice.title} onDismiss={editor.dismissNotice}>
          {notice.message}
          {notice.requestId ? (
            <>
              {' '}
              {copy.errors.requestId}: <code>{notice.requestId}</code>
            </>
          ) : null}
        </Banner>
      ) : null}
      {isApproved && !hasConflict ? (
        <Banner
          tone="info"
          title={copy.approved.readOnlyTitle}
          action={
            <Button size="sm" variant="secondary" icon="plus" onPress={() => void navigate({ to: '/posts/new' })}>
              {copy.approved.newPost}
            </Button>
          }
        >
          {copy.approved.readOnlyBody}
        </Banner>
      ) : null}

      {narrow ? (
        <div className={styles.tabsRoot}>
          <Tabs>
            <TabList aria-label={copy.tabs.label}>
              <Tab id="edit">
                <Icon name="edit" size={16} />
                {copy.tabs.edit}
              </Tab>
              <Tab id="preview">
                <Icon name="send" size={16} />
                {copy.tabs.preview}
              </Tab>
            </TabList>
            <TabPanel id="edit" shouldForceMount>
              {fields}
            </TabPanel>
            <TabPanel id="preview" shouldForceMount>
              {preview}
            </TabPanel>
          </Tabs>
        </div>
      ) : (
        <div className={styles.panes}>
          {fields}
          {preview}
        </div>
      )}

      <div className={styles.actionBar}>
        {isApproved ? (
          baseline && approvedActions ? (
            approvedActions(baseline)
          ) : null
        ) : (
          <>
            <Button
              variant={editor.dirty || editor.isNew ? 'primary' : 'secondary'}
              icon="check"
              isLoading={editor.isSaving}
              isDisabled={!canSave}
              onPress={() => void editor.save()}
            >
              {editor.isNew ? copy.create : copy.save}
            </Button>
            {!editor.isNew ? (
              <Button
                variant={editor.dirty ? 'secondary' : 'primary'}
                isDisabled={!canApprove}
                onPress={() => setApproveOpen(true)}
              >
                {copy.approve}
              </Button>
            ) : null}
            <span className={styles.shortcut}>{copy.saveHint}</span>
          </>
        )}
      </div>

      <CompareDialog
        isOpen={compareOpen}
        onOpenChange={setCompareOpen}
        mine={{ title: editor.title, body: editor.body }}
        server={conflict?.server ?? null}
        onUseServer={editor.acceptServer}
      />
      <ConfirmDialog
        isOpen={approveOpen}
        onOpenChange={setApproveOpen}
        title={copy.approveDialog.title(editor.title.trim() || copy.untitled)}
        description={editor.dirty ? copy.approveDialog.descriptionDirty : copy.approveDialog.description}
        confirmLabel={copy.approveDialog.confirm}
        cancelLabel={copy.approveDialog.cancel}
        tone="default"
        isPending={editor.isApproving || editor.isSaving}
        onConfirm={() => void confirmApprove()}
      />
      <ConfirmDialog
        isOpen={overwriteOpen}
        onOpenChange={setOverwriteOpen}
        title={copy.conflict.overwriteDialog.title}
        description={copy.conflict.overwriteDialog.description}
        confirmLabel={copy.conflict.overwriteDialog.confirm}
        cancelLabel={copy.conflict.overwriteDialog.cancel}
        isPending={editor.isSaving}
        onConfirm={() => void confirmOverwrite()}
      />
      <ConfirmDialog
        isOpen={blocker.status === 'blocked'}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
        title={copy.leave.title}
        description={copy.leave.description}
        confirmLabel={copy.leave.confirm}
        cancelLabel={copy.leave.cancel}
        onConfirm={() => blocker.proceed?.()}
      />
    </div>
  );
}
