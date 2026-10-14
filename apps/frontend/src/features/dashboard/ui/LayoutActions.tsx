import { useState } from 'react';
import { Button, ConfirmDialog, IconButton, useMediaQuery } from '../../../shared/ui';
import type { useLayoutEditing } from '../model/use-layout-editing';
import { copy } from './copy';
import { WidgetCatalogDialog } from './WidgetCatalogDialog';

export type LayoutEditing = ReturnType<typeof useLayoutEditing>;

/** Header buttons of Обзор: «Настроить» outside edit mode; add, reset, cancel and «Готово» inside it. */
export function LayoutActions({ editing, children }: { editing: LayoutEditing; children?: React.ReactNode }) {
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [confirm, setConfirm] = useState<'discard' | 'reset' | null>(null);
  // On a phone the four edit buttons share one row: «Добавить» keeps its full name for screen readers.
  const phone = useMediaQuery('(max-width: 859px)');

  if (!editing.editing) {
    return (
      <>
        <IconButton
          icon="grid"
          variant="secondary"
          label={copy.edit.customize}
          isDisabled={!editing.canEdit}
          onPress={editing.start}
        />
        {children}
      </>
    );
  }

  return (
    <>
      <Button
        variant="secondary"
        icon="plus"
        {...(phone ? { 'aria-label': copy.edit.add } : {})}
        onPress={() => setCatalogOpen(true)}
      >
        {phone ? copy.edit.addShort : copy.edit.add}
      </Button>
      {phone ? (
        <IconButton icon="undo" variant="ghost" label={copy.edit.reset} onPress={() => setConfirm('reset')} />
      ) : (
        <Button variant="ghost" onPress={() => setConfirm('reset')}>
          {copy.edit.reset}
        </Button>
      )}
      <Button variant="ghost" onPress={() => (editing.dirty ? setConfirm('discard') : editing.cancel())}>
        {copy.edit.cancel}
      </Button>
      <Button {...(phone ? {} : { icon: 'check' as const })} isLoading={editing.saving} onPress={editing.done}>
        {copy.edit.done}
      </Button>
      <WidgetCatalogDialog
        isOpen={catalogOpen}
        onOpenChange={setCatalogOpen}
        items={editing.items}
        onAdd={editing.add}
      />
      <ConfirmDialog
        isOpen={confirm === 'discard'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={copy.edit.discardTitle}
        description={copy.edit.discardBody}
        confirmLabel={copy.edit.discard}
        cancelLabel={copy.edit.keepEditing}
        tone="danger"
        onConfirm={() => {
          setConfirm(null);
          editing.cancel();
        }}
      />
      <ConfirmDialog
        isOpen={confirm === 'reset'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={copy.edit.resetTitle}
        description={copy.edit.resetBody}
        confirmLabel={copy.edit.resetConfirm}
        cancelLabel={copy.edit.keepEditing}
        onConfirm={() => {
          setConfirm(null);
          editing.reset();
        }}
      />
    </>
  );
}
