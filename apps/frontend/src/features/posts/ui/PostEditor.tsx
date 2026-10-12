import type { PostDto } from '@alexeev/contracts';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  Banner,
  Button,
  ConfirmDialog,
  Icon,
  Menu,
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
import { PostMediaEditor } from './PostMediaEditor';
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
  headerActions?: ReactNode;
};

const copy = postsCopy.editor;
const NARROW = '(max-width: 859px)';

export function PostEditor({ post, onCreated, approvedActions, aside, headerActions }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(false);
  const mediaWriteLockState = useRef(false);
  const mediaWriteLock = {
    isLocked: () => mediaWriteLockState.current,
    tryAcquire: () => {
      if (mediaWriteLockState.current) return false;
      mediaWriteLockState.current = true;
      return true;
    },
    release: () => {
      mediaWriteLockState.current = false;
    }
  };
  const editor = usePostEditor({ post, onCreated, rootRef, dirtyRef, mediaWriteLock });
  const setEditorMediaPending = editor.setMediaPending;
  const setMediaPending = useCallback((pending: boolean) => setEditorMediaPending(pending), [setEditorMediaPending]);
  const { baseline, conflict, notice } = editor;
  const narrow = useMediaQuery(NARROW);
  const navigate = useNavigate();
  const blocker = useLeaveGuard(dirtyRef);
  useClosingConfirmation((editor.dirty || editor.mediaPending) && !editor.readOnly);
  const statusRef = useRef<HTMLDivElement>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [desktopPreviewOpen, setDesktopPreviewOpen] = useState(true);
  const [approveOpen, setApproveOpen] = useState(false);
  const [overwriteOpen, setOverwriteOpen] = useState(false);

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
  const canApprove =
    editor.title.trim().length > 0 &&
    !editor.readOnly &&
    !hasConflict &&
    !editor.isSaving &&
    !editor.isApproving &&
    !editor.mediaPending &&
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

  async function backToPosts() {
    if (!editor.isNew) {
      await saveAndExit();
      return;
    }
    if (editor.dirty || editor.mediaPending) {
      const saved = await editor.save();
      if (!saved) return;
    }
    await navigate({ to: '/posts' });
  }

  async function confirmApprove() {
    const approved = await editor.approvePost();
    setApproveOpen(false);
    // The button that opened the dialog is gone after approval: move focus to the announced status.
    if (approved) {
      statusRef.current?.focus();
      void navigate({ to: '/posts/$id/publish', params: { id: approved.id } });
    }
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
  const mediaEditor = (
    <PostMediaEditor
      postId={baseline?.id ?? null}
      revision={baseline?.revision ?? 0}
      media={baseline?.media ?? []}
      disabled={editor.readOnly || hasConflict}
      mediaWriteLock={mediaWriteLock}
      onServerChange={editor.adoptMedia}
      onPendingChange={setMediaPending}
      onEnsurePost={editor.ensureDraftForMedia}
      onMediaSaved={editor.syncLeaveGuardAfterMediaSave}
      onRevisionConflict={() => {
        editor.markMediaConflict();
        setCompareOpen(true);
      }}
      onDraftReady={(saved) => void navigate({ to: '/posts/$id', params: { id: saved.id }, replace: true })}
    />
  );
  const previewPanel = (
    <>
      <PostPreview
        title={editor.title}
        body={editor.body}
        entities={editor.entities}
        length={editor.length}
        media={baseline?.media ?? []}
        desktopHeader={!narrow}
        onCollapse={!narrow && !showApprovedPreview ? () => setDesktopPreviewOpen(false) : undefined}
      />
    </>
  );
  // Desktop: the right column switches between the Telegram preview and this post's publications.
  const side = (
    <div className={`${styles.previewColumn} ${showApprovedPreview ? styles.previewStandalone : styles.previewInPane}`}>
      {aside && showApprovedPreview ? (
        <Tabs>
          <TabList aria-label={copy.tabs.sideLabel}>
            <Tab id="preview">{copy.tabs.preview}</Tab>
            <Tab id="pubs">{postsCopy.publications.title}</Tab>
          </TabList>
          <TabPanel id="preview">{previewPanel}</TabPanel>
          <TabPanel id="pubs">{aside}</TabPanel>
        </Tabs>
      ) : (
        previewPanel
      )}
    </div>
  );

  const actions = isApproved ? (
    baseline && approvedActions && !isArchived ? (
      approvedActions(baseline)
    ) : null
  ) : (
    <Button
      size="xl"
      icon="arrow-right"
      isLoading={editor.isApproving || editor.isSaving}
      isDisabled={!canApprove}
      onPress={() => setApproveOpen(true)}
    >
      К публикации
    </Button>
  );
  return (
    <div ref={rootRef} className={styles.editor}>
      <header className={styles.titleRow}>
        {narrow ? (
          <Button
            variant="ghost"
            size="lg"
            icon="chevron-left"
            aria-label={mobilePreviewOpen ? copy.previewReturn : copy.back}
            onPress={() => {
              if (mobilePreviewOpen) {
                setMobilePreviewOpen(false);
                return;
              }
              void backToPosts();
            }}
            className={styles.backButton}
          />
        ) : null}
        <div className={styles.titleCopy}>
          <h1 ref={statusRef} tabIndex={-1}>
            {narrow ? 'Новый пост' : editor.isNew ? 'Новый пост' : editor.title.trim() || copy.untitled}
          </h1>
          <span className={styles.saveStatus}>
            <span className={styles.statusDot} data-state={editor.saveState} />
            <SaveIndicator state={editor.saveState} savedAt={baseline?.updatedAt} compact={narrow} />
          </span>
        </div>
        {narrow && !showApprovedPreview ? (
          <Menu
            label={copy.moreActions}
            items={[{ id: 'preview', label: copy.tabs.preview, icon: 'eye' }]}
            onAction={() => setMobilePreviewOpen(true)}
          />
        ) : null}
        {headerActions ? <span className={styles.headerActions}>{headerActions}</span> : null}
        {!narrow && !showApprovedPreview && !desktopPreviewOpen ? (
          <Button variant="secondary" size="sm" icon="eye" onPress={() => setDesktopPreviewOpen(true)}>
            Предпросмотр
          </Button>
        ) : null}
        {editor.saveState === 'failed' && !editor.readOnly && !hasConflict ? (
          <Button variant="ghost" size="sm" icon="retry" onPress={() => void editor.save()}>
            {copy.errors.retry}
          </Button>
        ) : null}
        <VisuallyHidden>
          <output>{editor.justApproved ? copy.approved.announce : ''}</output>
        </VisuallyHidden>
      </header>

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
      ) : narrow && mobilePreviewOpen ? (
        previewPanel
      ) : narrow ? (
        <div className={styles.phoneStack}>
          {fields}
          {mediaEditor}
        </div>
      ) : (
        <div className={`${styles.panes} ${!desktopPreviewOpen ? styles.previewCollapsed : ''}`}>
          <div className={styles.leftColumn}>
            <div className={styles.writeCard}>{fields}</div>
            {mediaEditor}
          </div>
          {desktopPreviewOpen ? side : null}
        </div>
      )}
      <footer className={narrow ? styles.actionBar : styles.footerBar}>
        <Button variant="secondary" size={narrow ? 'sm' : 'xl'} icon="log-out" onPress={() => void saveAndExit()}>
          Выйти
        </Button>
        <p className={styles.footerNote}>
          <Icon name="info" size={16} />
          Черновик сохраняется автоматически
        </p>
        <div className={styles.footerPrimary}>{actions}</div>
      </footer>

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
        description={
          editor.mediaPending
            ? 'Есть файл, который не удалось загрузить или который ещё не сохранён на сервере. При выходе его локальная копия исчезнет — добавьте этот файл повторно. Текст и уже загруженные вложения останутся в черновике.'
            : copy.leave.description
        }
        confirmLabel={copy.leave.confirm}
        cancelLabel={copy.leave.cancel}
        onConfirm={() => blocker.proceed?.()}
      />
    </div>
  );
}
