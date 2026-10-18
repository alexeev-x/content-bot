import type { PostDto } from '@alexeev/contracts';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  Banner,
  Button,
  ConfirmDialog,
  Disclosure,
  Icon,
  IconButton,
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
import { PollEditor } from './PollEditor';
import { PostKindNote } from './PostKindNote';
import { ConflictBanner } from './ConflictBanner';
import { postsCopy } from './copy';
import { PostFields } from './PostFields';
import { PostMediaEditor } from './PostMediaEditor';
import { PostPreview } from './PostPreview';
import styles from './PostEditor.module.css';
import { OriginMark } from './OriginMark';
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
  /** Tab the editor opens on; «Создать опрос» sends a new post straight to the poll form. */
  initialTab?: 'editor' | 'poll' | undefined;
};

const copy = postsCopy.editor;

type ComposerTab = 'editor' | 'poll';
const NARROW = '(max-width: 859px)';

export function PostEditor({ post, onCreated, approvedActions, aside, headerActions, initialTab }: Props) {
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
  const [composerTab, setComposerTab] = useState<ComposerTab>(
    initialTab ?? (post?.kind === 'poll' ? 'poll' : 'editor')
  );
  // «К публикации» was pressed with something missing: from then on the fields show what stops the post.
  const [publishTried, setPublishTried] = useState(false);
  const editor = usePostEditor({
    post,
    onCreated,
    rootRef,
    dirtyRef,
    mediaWriteLock,
    createKind: composerTab === 'poll' ? 'poll' : 'text'
  });
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
  const activeCounts = baseline?.publicationSummary.counts;
  const canReturnToDraft =
    activeCounts !== undefined &&
    activeCounts.unknown +
      activeCounts.preparing +
      activeCounts.sending +
      activeCounts.scheduled +
      activeCounts.queued +
      activeCounts.retry_wait ===
      0;
  const showApprovedPreview = isApproved && !isArchived && !hasConflict;
  const isPoll = editor.kind === 'poll';
  // Nothing to send: a text post needs text or at least one file (owner, 18.10.2026: say so, not a dead button).
  const missingContent = !isPoll && editor.body.trim() === '' && (baseline?.media.length ?? 0) === 0;
  const publishBlocked =
    (isPoll ? editor.pollIssue !== null : missingContent) ||
    (editor.hasTitle && editor.title.trim().length === 0) ||
    editor.mixed ||
    editor.overflow > 0;
  const canContinue = !editor.readOnly && !hasConflict && !editor.isSaving && !editor.mediaPending;

  async function saveAndExit() {
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

  async function continueToPublish() {
    if (publishBlocked) {
      setPublishTried(true);
      // After the errors render: focus the first field that says what is missing.
      requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    // Approval happens on the publish screen together with the send; here only the text is saved.
    let id = baseline?.id ?? null;
    if (editor.dirty || baseline === null) {
      const saved = await editor.save();
      if (!saved) return;
      id = saved.id;
    }
    if (id === null) return;
    dirtyRef.current = false;
    void navigate({ to: '/posts/$id/publish', params: { id } });
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
      hasTitle={editor.hasTitle}
      body={editor.body}
      entities={editor.entities}
      isReadOnly={editor.readOnly}
      isNew={editor.isNew}
      length={editor.length}
      overflow={editor.overflow}
      contentError={publishTried && missingContent ? copy.validation.nothingToSend : undefined}
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
        title={editor.hasTitle ? editor.title : ''}
        body={editor.body}
        entities={editor.entities}
        length={editor.length}
        media={isPoll ? [] : (baseline?.media ?? [])}
        poll={isPoll ? editor.poll : null}
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

  // «Редактор / Опрос» (send options are on the publish step). The editor stays mounted while another
  // tab is shown: the text, the selection and the undo history must survive a look at the other tabs.
  // A saved post keeps its kind: the tab of the other kind only explains that and offers a new post.
  const savedKind = editor.isNew ? null : editor.kind;
  const editingArea = narrow ? (
    <div className={styles.phoneStack}>
      {fields}
      {mediaEditor}
    </div>
  ) : (
    <div className={styles.leftColumn}>
      <div className={styles.writeCard}>{fields}</div>
      {mediaEditor}
    </div>
  );
  const mixedNotice = editor.mixed ? (
    <Banner tone="warning" title={postsCopy.poll.mixedTitle}>
      {postsCopy.poll.mixedBody}
    </Banner>
  ) : null;
  const pollForm = (
    <div className={styles.pollStack}>
      {mixedNotice}
      <PollEditor
        poll={editor.poll}
        onChange={editor.setPoll}
        issue={editor.pollIssue}
        isReadOnly={editor.readOnly}
        showErrors={publishTried}
      />
      {narrow ? (
        <Disclosure id="poll-preview" title={copy.composer.mobilePreview}>
          {previewPanel}
        </Disclosure>
      ) : null}
    </div>
  );
  const composer = (
    <div className={styles.tabsRoot}>
      <Tabs selectedKey={composerTab} onSelectionChange={(key) => setComposerTab(String(key) as ComposerTab)}>
        <TabList aria-label={copy.composer.label}>
          <Tab id="editor">{copy.composer.editor}</Tab>
          <Tab id="poll">{copy.composer.poll}</Tab>
        </TabList>
        {/* The preview column sits beside whichever panel is open, so there is one live preview, not one per tab. */}
        <div className={narrow ? undefined : `${styles.panes} ${!desktopPreviewOpen ? styles.previewCollapsed : ''}`}>
          <div className={styles.paneMain}>
            {/* The editor stays mounted while another tab is shown: text, selection and undo history must survive. */}
            <TabPanel id="editor" shouldForceMount>
              {savedKind === 'poll' ? (
                <PostKindNote kind="poll" onCreate={() => void navigate({ to: '/posts/new' })} />
              ) : (
                <>
                  {composerTab === 'editor' ? mixedNotice : null}
                  {editingArea}
                </>
              )}
            </TabPanel>
            <TabPanel id="poll">
              {savedKind === 'text' ? (
                <PostKindNote
                  kind="text"
                  onCreate={() => void navigate({ to: '/posts/new', search: { tab: 'poll' } })}
                />
              ) : (
                pollForm
              )}
            </TabPanel>
          </div>
          {!narrow && desktopPreviewOpen ? side : null}
        </div>
      </Tabs>
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
      isLoading={editor.isSaving}
      isDisabled={!canContinue}
      onPress={() => void continueToPublish()}
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
            {editor.isNew ? copy.composer.newTitle : editor.title.trim() || copy.untitled}
          </h1>
          {/* Studio-only: who wrote the post (owner, 16.10.2026: «внутри поста я нигде не вижу, что это ИИ»). */}
          <OriginMark origin={baseline?.origin} />
          <span className={styles.saveStatus}>
            <span className={styles.statusDot} data-state={editor.saveState} />
            <SaveIndicator state={editor.saveState} savedAt={baseline?.updatedAt} compact={narrow} />
          </span>
        </div>
        {/* A toggle (owner, 17.10.2026: a second press did nothing and the eye did not say where you are): the eye
            opens the preview, the pencil brings the editor back. */}
        {narrow && !showApprovedPreview ? (
          <IconButton
            label={mobilePreviewOpen ? copy.previewReturn : copy.tabs.preview}
            icon={mobilePreviewOpen ? 'edit' : 'eye'}
            variant={mobilePreviewOpen ? 'secondary' : 'ghost'}
            onPress={() => setMobilePreviewOpen((open) => !open)}
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
          isBusy={editor.isSaving || editor.isApproving || editor.isReturning}
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
            <div className={styles.bannerActions}>
              {canReturnToDraft ? (
                <Button
                  size="sm"
                  variant="secondary"
                  icon="edit"
                  isLoading={editor.isReturning}
                  onPress={() => void editor.returnToDraft()}
                >
                  {postsCopy.actions.returnToDraft}
                </Button>
              ) : null}
              <Button size="sm" variant="secondary" icon="plus" onPress={() => void navigate({ to: '/posts/new' })}>
                {copy.approved.newPost}
              </Button>
            </div>
          }
        >
          {canReturnToDraft ? copy.approved.readOnlyBody : copy.approved.readOnlyBodyNoReturn}
        </Banner>
      ) : null}

      {showApprovedPreview ? side : narrow && mobilePreviewOpen ? previewPanel : composer}
      <footer className={narrow ? styles.actionBar : styles.footerBar}>
        <Button variant="secondary" size={narrow ? 'sm' : 'xl'} icon="arrow-left" onPress={() => void backToPosts()}>
          К постам
        </Button>
        <p className={styles.footerNote}>
          <Icon name="info" size={16} />
          {isApproved ? copy.approved.footerNote : 'Черновик сохраняется автоматически'}
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
