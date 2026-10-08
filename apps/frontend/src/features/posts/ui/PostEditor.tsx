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
import { useClosingConfirmation } from '../../../shared/telegram/use-closing-confirmation';
import { useAutosave } from '../model/use-autosave';
import { useLeaveGuard } from '../model/use-leave-guard';
import { usePostEditor } from '../model/use-post-editor';
import { useSaveShortcut } from '../model/use-save-shortcut';
import { CompareDialog } from './CompareDialog';
import { ConflictBanner } from './ConflictBanner';
import { postsCopy } from './copy';
import { PostFields } from './PostFields';
import { PostPreview } from './PostPreview';
import { PostRevisionHistory } from './PostRevisionHistory';
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
  useClosingConfirmation(editor.dirty && !editor.readOnly);
  const statusRef = useRef<HTMLDivElement>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [overwriteOpen, setOverwriteOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  useSaveShortcut(() => void editor.save());
  useAutosave({
    enabled: editor.canAutosave,
    changeKey: editor.changeKey,
    onSave: () => void editor.save()
  });

  const isApproved = baseline?.status === 'approved';
  // An archived post is read-only and its page explains why; the approved notice and the publish action do not apply.
  const isArchived = baseline?.archivedAt != null;
  const hasConflict = conflict !== null;
  const showApprovedPreview = isApproved && !isArchived && !hasConflict;
  const canSave = !editor.readOnly && !hasConflict && !editor.isSaving && !editor.isApproving;
  const canApprove =
    !editor.isNew &&
    !editor.readOnly &&
    !hasConflict &&
    !editor.isSaving &&
    !editor.isApproving &&
    editor.overflow === 0;

  async function saveAndExit() {
    if (editor.isNew) {
      await editor.save();
      return;
    }
    if (editor.dirty) {
      const saved = await editor.save();
      if (!saved) return;
      const current = editor.form.getValues();
      // If the operator kept typing during the request, leave the newer text in the editor.
      if (current.title !== saved.title || current.body !== saved.body) return;
      dirtyRef.current = false;
    }
    await navigate({ to: '/posts' });
  }

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
      setValue={editor.form.setValue}
      title={editor.title}
      body={editor.body}
      entities={editor.entities}
      isReadOnly={editor.readOnly}
      isNew={editor.isNew}
      length={editor.length}
      overflow={editor.overflow}
    />
  );
  const previewPanel = (
    <PostPreview title={editor.title} body={editor.body} entities={editor.entities} length={editor.length} />
  );
  // Desktop: the right column switches between the Telegram preview and this post's publications.
  const side = (
    <div className={`${styles.previewColumn} ${showApprovedPreview ? styles.previewStandalone : styles.previewInPane}`}>
      <Tabs>
        <TabList aria-label={copy.tabs.sideLabel}>
          <Tab id="preview">{copy.tabs.preview}</Tab>
          {aside ? <Tab id="pubs">{postsCopy.publications.title}</Tab> : null}
        </TabList>
        <TabPanel id="preview">{previewPanel}</TabPanel>
        {aside ? <TabPanel id="pubs">{aside}</TabPanel> : null}
      </Tabs>
    </div>
  );

  return (
    <div ref={rootRef} className={styles.editor}>
      <div ref={statusRef} tabIndex={-1} className={styles.meta}>
        <StatusBadge status={baseline?.status ?? 'draft'} />
        {baseline ? (
          <Button
            variant="ghost"
            size="sm"
            aria-label={copy.history.open}
            onPress={() => setHistoryOpen(true)}
          >
            <span className="mono">{copy.revision(baseline.revision)}</span>
          </Button>
        ) : null}
        <SaveIndicator state={editor.saveState} savedAt={baseline?.updatedAt} />
        {editor.saveState === 'failed' && !editor.readOnly && !hasConflict ? (
          <Button variant="ghost" size="sm" icon="retry" onPress={() => void editor.save()}>
            {copy.errors.retry}
          </Button>
        ) : null}
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
      {isApproved && !isArchived && !hasConflict ? (
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

      {showApprovedPreview ? (
        side
      ) : narrow ? (
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
              {aside ? (
                <Tab id="pubs">
                  <Icon name="calendar" size={16} />
                  {copy.tabs.publications}
                </Tab>
              ) : null}
            </TabList>
            <TabPanel id="edit" shouldForceMount>
              {fields}
            </TabPanel>
            <TabPanel id="preview" shouldForceMount>
              <div className={styles.previewColumn}>{previewPanel}</div>
            </TabPanel>
            {aside ? (
              <TabPanel id="pubs">
                <div className={styles.previewColumn}>{aside}</div>
              </TabPanel>
            ) : null}
          </Tabs>
        </div>
      ) : (
        <div className={styles.panes}>
          <div className="reading-width">{fields}</div>
          {side}
        </div>
      )}

      <div className={styles.actionBar}>
        {isApproved ? (
          baseline && approvedActions && !isArchived ? (
            approvedActions(baseline)
          ) : null
        ) : (
          <>
            <Button
              variant={editor.dirty || editor.isNew ? 'primary' : 'secondary'}
              icon="check"
              isLoading={editor.isSaving}
              isDisabled={!canSave}
              onPress={() => void saveAndExit()}
            >
              {editor.isNew ? copy.create : copy.saveAndExit}
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
            <span className={styles.shortcut}>{editor.isNew ? copy.saveHint : copy.saveInPlaceHint}</span>
          </>
        )}
      </div>

      {baseline ? (
        <PostRevisionHistory
          postId={baseline.id}
          isOpen={historyOpen}
          onOpenChange={setHistoryOpen}
        />
      ) : null}
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
