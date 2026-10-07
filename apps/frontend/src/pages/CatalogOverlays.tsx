import { useState } from 'react';
import {
  Button,
  ConfirmDialog,
  Dialog,
  Disclosure,
  DisclosureGroup,
  Drawer,
  IconButton,
  Menu,
  Popover,
  StatusBadge,
  Timeline,
  Tooltip,
  useToast
} from '../shared/ui';
import styles from './CatalogPage.module.css';

const MENU = [
  { id: 'edit', label: 'Edit', icon: 'edit' },
  { id: 'duplicate', label: 'Duplicate', icon: 'file' },
  { id: 'disabled', label: 'Disabled item', isDisabled: true },
  { id: 'delete', label: 'Delete', icon: 'trash', tone: 'danger' }
] as const;
const VIEWS = [
  { id: 'list', label: 'List' },
  { id: 'cards', label: 'Cards' }
] as const;
const ATTEMPTS = [
  {
    id: '1',
    title: 'Attempt 1',
    time: '07 окт, 10:00:02',
    status: 'failed',
    description: 'Telegram: 502, ответ не получен.'
  },
  {
    id: '2',
    title: 'Attempt 2',
    time: '07 окт, 10:05:11',
    status: 'unknown',
    description: 'Ответ не подтверждён за 30 с.'
  }
] as const;

export function CatalogOverlays() {
  const [dialog, setDialog] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [view, setView] = useState('list');
  const toast = useToast();

  return (
    <>
      <h3 className={styles.group}>Dialog, drawer, toast</h3>
      <div className={styles.row}>
        <Button variant="secondary" onPress={() => setDialog(true)}>
          Dialog
        </Button>
        <Button variant="danger" onPress={() => setConfirm(true)}>
          Confirm
        </Button>
        <Button variant="secondary" onPress={() => setDrawer(true)}>
          Drawer
        </Button>
        <Button variant="secondary" onPress={() => setSheet(true)}>
          Sheet
        </Button>
      </div>
      <div className={styles.row}>
        <Button size="sm" variant="ghost" onPress={() => toast.show({ tone: 'info', title: 'Черновик сохранён' })}>
          Info toast
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onPress={() =>
            toast.show({
              tone: 'success',
              title: 'Публикация отправлена',
              description: 'Статус обновится после ответа Telegram.'
            })
          }
        >
          Success toast
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onPress={() =>
            toast.show({
              tone: 'error',
              title: 'Не удалось сохранить',
              description: 'Идентификатор запроса: req_8f3a2c'
            })
          }
        >
          Error toast
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onPress={() =>
            toast.show({
              tone: 'error',
              title: 'Не удалось сохранить тему. Вернули прежнюю.',
              action: { label: 'Повторить', onPress: () => undefined }
            })
          }
        >
          Toast with action
        </Button>
      </div>

      <h3 className={styles.group}>Disclosure</h3>
      <DisclosureGroup defaultExpandedKeys={['open']}>
        <Disclosure id="open" title="Открытый раздел">
          Содержимое показывается по требованию.
        </Disclosure>
        <Disclosure id="closed" title="Свёрнутый раздел">
          Второй раздел можно открыть одновременно с первым.
        </Disclosure>
      </DisclosureGroup>

      <h3 className={styles.group}>Menu, popover, tooltip</h3>
      <div className={styles.row}>
        <Menu label="Post actions" items={MENU} />
        <Menu label="Actions" triggerText="Actions" items={MENU} />
        <Menu
          label="View"
          triggerText="View"
          items={VIEWS}
          selectionMode="single"
          selectedId={view}
          onSelect={setView}
        />
        <Popover
          trigger={
            <Button variant="secondary" size="sm">
              Popover
            </Button>
          }
          label="Details"
        >
          <p>Non-modal details anchored to the trigger.</p>
        </Popover>
        <Tooltip content="Tooltip text">
          <IconButton label="Hover or focus me" icon="info" showTooltip={false} />
        </Tooltip>
        <IconButton label="Icon button with tooltip" icon="sparkle" variant="secondary" />
      </div>

      <Dialog
        isOpen={dialog}
        onOpenChange={setDialog}
        title="Rename channel"
        description="The name is shown only in this admin."
        footer={
          <>
            <Button variant="ghost" onPress={() => setDialog(false)}>
              Cancel
            </Button>
            <Button onPress={() => setDialog(false)}>Save</Button>
          </>
        }
      >
        <p>Dialog body content.</p>
      </Dialog>
      <ConfirmDialog
        isOpen={confirm}
        onOpenChange={setConfirm}
        title={'Отменить публикацию «Герой дня» на 14:30?'}
        description="Публикация не уйдёт в канал. Это действие нельзя отменить."
        confirmLabel="Отменить публикацию"
        cancelLabel="Не отменять"
        onConfirm={() => setConfirm(false)}
      />
      <Drawer
        isOpen={drawer}
        onOpenChange={setDrawer}
        title="Герой дня: Invoker"
        meta={<StatusBadge status="unknown" />}
        footer={
          <>
            <Button onPress={() => setDrawer(false)}>Сверить вручную</Button>
            <Button variant="ghost" onPress={() => setDrawer(false)}>
              Закрыть
            </Button>
          </>
        }
      >
        <Timeline aria-label="Attempts" items={ATTEMPTS} />
      </Drawer>
      <Drawer variant="bottom" isOpen={sheet} onOpenChange={setSheet} title="Bottom sheet">
        <p>Used by the «Ещё» menu of the tab bar.</p>
      </Drawer>
    </>
  );
}
