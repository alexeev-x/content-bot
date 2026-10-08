import type { DashboardWidget } from '@alexeev/contracts';
import { useBlocker } from '@tanstack/react-router';
import { lazy, Suspense, useState } from 'react';
import { useClosingConfirmation } from '../../../shared/telegram/use-closing-confirmation';
import { PHONE_QUERY } from '../model/geometry';
import { reorderSequence } from '../model/layout-ops';
import type { useLayoutEditor } from '../model/use-layout-editor';
import { Banner, Button, ConfirmDialog, useMediaQuery, VisuallyHidden } from '../../../shared/ui';
import { copy } from './copy';
import styles from './DashboardEditor.module.css';
import type { PageBindings } from './Dashboard';
import { EditCard } from './EditCard';
import { WidgetBody } from './WidgetBody';
import { buildView } from '../model/build-view';
import { useNow } from '../model/use-now';
import { EmptyWidgets } from './EmptyWidgets';
import { PhoneEditList } from './PhoneEditList';
import { WidgetCatalog } from './WidgetCatalog';
import { WidgetGrid } from './WidgetGrid';

// react-grid-layout and its stylesheet live in this chunk, which only the edit mode requests.
const EditGrid = lazy(() => import('./EditGrid').then((module) => ({ default: module.EditGrid })));

type Props = { editor: ReturnType<typeof useLayoutEditor>; bindings: PageBindings };

/** The edit mode: toolbar, conflict and error banners, the grid (or the phone list), the catalog and the discard confirm. */
export function DashboardEditor({ editor, bindings }: Props) {
  const now = useNow();
  const phone = useMediaQuery(PHONE_QUERY);
  const [catalogOpen, setCatalogOpen] = useState(editor.catalogFirst);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const draft = editor.draft ?? [];
  const { query, checks, services } = bindings;
  // The real content comes from what the page already holds in the query cache; nothing is fetched for it here.
  const env = {
    ...bindings,
    view: query.data ? buildView(query.data, checks, services) : undefined,
    services,
    skeleton: false,
    now,
    phone: false
  };
  const renderBody = (widget: DashboardWidget) => <WidgetBody widget={widget} env={env} />;
  // Leaving the page (or closing the Mini App) with unsaved edits asks first, as the appearance editor does.
  const blocker = useBlocker({
    shouldBlockFn: () => editor.isDirty,
    enableBeforeUnload: () => editor.isDirty,
    withResolver: true
  });
  useClosingConfirmation(editor.isDirty);

  return (
    <div className={styles.root}>
      {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role */}
      <div className={styles.bar} role="group" aria-label={copy.edit.toolbar}>
        <div className={styles.barGroup}>
          {/* Focus lands in the edit toolbar when «Настроить» disappears, so a keyboard user is not dropped on the page. */}
          {/* oxlint-disable-next-line jsx-a11y/no-autofocus */}
          <Button variant="secondary" icon="plus" autoFocus onPress={() => setCatalogOpen(true)}>
            {copy.edit.addWidget}
          </Button>
          <Button variant="ghost" onPress={editor.reset}>
            {copy.edit.reset}
          </Button>
        </div>
        <div className={styles.barGroup}>
          <Button
            variant="secondary"
            isDisabled={editor.isSaving}
            onPress={() => (editor.isDirty ? setConfirmOpen(true) : editor.discard())}
          >
            {copy.edit.cancel}
          </Button>
          <Button isLoading={editor.isSaving} onPress={() => void editor.submit()}>
            {copy.edit.done}
          </Button>
        </div>
      </div>

      {editor.conflict ? (
        <Banner
          tone="conflict"
          title={copy.edit.conflictTitle}
          action={
            <>
              <Button size="sm" variant="secondary" onPress={() => void editor.reloadFromServer()}>
                {copy.edit.reload}
              </Button>
              <Button size="sm" onPress={() => void editor.keepMine()}>
                {copy.edit.keepMine}
              </Button>
            </>
          }
        >
          {copy.edit.conflictBody}
        </Banner>
      ) : null}
      {editor.reloadFailed ? <Banner tone="error" title={copy.edit.reloadFailed} /> : null}

      <VisuallyHidden>
        <output>{editor.announcement}</output>
      </VisuallyHidden>

      {draft.length === 0 ? <EmptyWidgets /> : null}
      {phone ? (
        <PhoneEditList
          widgets={draft}
          onReorder={(ids) => editor.commit(reorderSequence(draft, ids))}
          onAction={(id, action) => editor.act(id, action, true)}
        />
      ) : (
        <Suspense
          fallback={
            <WidgetGrid widgets={draft} phone={false} label={copy.edit.gridLabel}>
              {(widget) => (
                <EditCard widget={widget} draft={draft}>
                  {renderBody(widget)}
                </EditCard>
              )}
            </WidgetGrid>
          }
        >
          <EditGrid
            widgets={draft}
            onCommit={editor.commit}
            onDrop={editor.drop}
            onAction={(id, action) => editor.act(id, action, false)}
            renderBody={renderBody}
          />
        </Suspense>
      )}

      <WidgetCatalog isOpen={catalogOpen} onOpenChange={setCatalogOpen} placed={draft} onAdd={editor.addWidget} />
      <ConfirmDialog
        isOpen={blocker.status === 'blocked'}
        onOpenChange={(open) => {
          if (!open && blocker.status === 'blocked') blocker.reset();
        }}
        title={copy.edit.leaveTitle}
        description={copy.edit.discardBody}
        confirmLabel={copy.edit.leaveConfirm}
        cancelLabel={copy.edit.discardKeep}
        onConfirm={() => {
          if (blocker.status === 'blocked') blocker.proceed();
        }}
      />
      <ConfirmDialog
        isOpen={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={copy.edit.discardTitle}
        description={copy.edit.discardBody}
        confirmLabel={copy.edit.discardConfirm}
        cancelLabel={copy.edit.discardKeep}
        onConfirm={() => {
          setConfirmOpen(false);
          editor.discard();
        }}
      />
    </div>
  );
}
