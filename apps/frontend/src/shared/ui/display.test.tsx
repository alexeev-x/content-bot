import { CalendarDateTime, toZoned } from '@internationalized/date';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Banner,
  Button,
  ConfirmDialog,
  DataTable,
  DateTimeField,
  Dialog,
  Drawer,
  ErrorState,
  KpiTile,
  Menu,
  StatusBadge,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  TelegramPreview,
  Timeline,
  ToastProvider,
  useToast,
  type StatusKey
} from './index';

afterEach(cleanup);

describe('StatusBadge', () => {
  it.each<[StatusKey, string, string]>([
    ['scheduled', 'Запланировано', 'pending'],
    ['preparing', 'Публикуется', 'active'],
    ['sending', 'Публикуется', 'active'],
    ['sent', 'Опубликовано', 'done'],
    ['retry_wait', 'Повтор по расписанию', 'retry'],
    ['failed', 'Ошибка', 'failed'],
    ['unknown', 'Требует проверки', 'unknown'],
    ['cancelled', 'Отменено', 'muted'],
    ['draft', 'Черновик', 'muted'],
    ['stale', 'Источник устарел', 'unknown']
  ])('%s shows its canonical label and token group', (status, label, group) => {
    render(<StatusBadge status={status} />);
    const badge = screen.getByText(label);
    expect(badge.getAttribute('data-group')).toBe(group);
    expect(badge.querySelector('svg')).toBeTruthy();
  });
});

describe('Banner, ErrorState, KpiTile, Timeline, TelegramPreview', () => {
  it('announces errors as alerts and shows the request id', () => {
    render(
      <>
        <Banner tone="error" title="Канал недоступен" />
        <ErrorState message="Сервер не ответил" requestId="req_1" onRetry={() => undefined} />
      </>
    );
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(screen.getByText('req_1')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Повторить/ })).toBeTruthy();
  });

  it('renders a KPI value with a decorative sparkline', () => {
    const { container } = render(<KpiTile label="Запланировано" value="12" trend={[1, 2, 3]} />);
    expect(screen.getByText('12')).toBeTruthy();
    expect(container.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
  });

  it('lists attempts in order with statuses', () => {
    render(
      <Timeline
        aria-label="Попытки"
        items={[
          { id: '1', title: 'Попытка 1', time: '10:00', status: 'failed' },
          { id: '2', title: 'Попытка 2', time: '10:05', status: 'sent' }
        ]}
      />
    );
    const items = within(screen.getByRole('list', { name: 'Попытки' })).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[1]!).getByText('Опубликовано')).toBeTruthy();
  });

  it('shows the Telegram body as text, never as markup', () => {
    render(<TelegramPreview title="Заголовок" body="<b>не жирный</b>" meta="10:00" />);
    expect(screen.getByText('<b>не жирный</b>')).toBeTruthy();
  });
});

describe('Dialog, ConfirmDialog, Drawer', () => {
  it('closes a dialog with Esc and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button onPress={() => setOpen(true)}>Открыть</Button>
          <Dialog isOpen={open} onOpenChange={setOpen} title="Переименовать">
            <p>Тело</p>
          </Dialog>
        </>
      );
    }
    render(<Host />);
    const trigger = screen.getByRole('button', { name: 'Открыть' });
    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Переименовать' })).toBeTruthy();
    await user.keyboard('{Escape}');
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('confirm dialog focuses the safe button first and confirms explicitly', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        isOpen
        onOpenChange={() => undefined}
        title="Отменить публикацию?"
        description="Она не уйдёт в канал."
        confirmLabel="Отменить публикацию"
        cancelLabel="Не отменять"
        onConfirm={onConfirm}
      />
    );
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Не отменять' }));
    await user.click(screen.getByRole('button', { name: 'Отменить публикацию' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('dismisses a confirmation with Esc without confirming', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button onPress={() => setOpen(true)}>РћС‚РєСЂС‹С‚СЊ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ</Button>
          <ConfirmDialog
            isOpen={open}
            onOpenChange={setOpen}
            title="РџСЂРёРѕСЃС‚Р°РЅРѕРІРёС‚СЊ Р°РІС‚РѕРјР°С‚РёР·Р°С†РёСЋ?"
            description="РўРµРєСѓС‰РёР№ Р·Р°РїСѓСЃРє РїСЂРѕРґРѕР»Р¶РёС‚СЃСЏ."
            confirmLabel="РџСЂРёРѕСЃС‚Р°РЅРѕРІРёС‚СЊ"
            onConfirm={onConfirm}
          />
        </>
      );
    }
    render(<Host />);
    const trigger = screen.getByRole('button', { name: 'РћС‚РєСЂС‹С‚СЊ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ' });
    await user.click(trigger);

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('drawer shows its title and a close button', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Drawer isOpen onOpenChange={onOpenChange} title="Публикация">
        <p>Детали</p>
      </Drawer>
    );
    expect(screen.getByRole('dialog', { name: 'Публикация' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('Menu and Tabs', () => {
  it('opens with Enter without activating the first item', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <Menu
        label="Действия"
        onAction={onAction}
        items={[
          { id: 'edit', label: 'Изменить' },
          { id: 'delete', label: 'Удалить' }
        ]}
      />
    );

    await user.tab();
    await user.keyboard('{Enter}');

    const item = screen.getByRole('menuitem', { name: 'Изменить' });
    expect(document.activeElement).toBe(item);
    expect(onAction).not.toHaveBeenCalled();
  });

  it('closes with Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<Menu label="Действия" items={[{ id: 'edit', label: 'Изменить' }]} />);

    await user.tab();
    const trigger = screen.getByRole('button', { name: 'Действия' });
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menu')).toBeTruthy();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('menu opens with ArrowDown and runs the action', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <Menu
        label="Действия"
        onAction={onAction}
        items={[
          { id: 'edit', label: 'Изменить' },
          { id: 'off', label: 'Недоступно', isDisabled: true },
          { id: 'del', label: 'Удалить', tone: 'danger' }
        ]}
      />
    );
    await user.tab();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menu')).toBeTruthy();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onAction).toHaveBeenCalledWith('del');
  });

  it('tabs move with arrows and skip disabled tabs', async () => {
    const user = userEvent.setup();
    render(
      <Tabs>
        <TabList aria-label="Разделы">
          <Tab id="a">Первая</Tab>
          <Tab id="b" isDisabled>
            Вторая
          </Tab>
          <Tab id="c">Третья</Tab>
        </TabList>
        <TabPanel id="a">A</TabPanel>
        <TabPanel id="c">C</TabPanel>
      </Tabs>
    );
    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Третья' }).getAttribute('aria-selected')).toBe('true');
  });
});

describe('Toast', () => {
  it('shows a toast in a labelled region and error toasts stay until dismissed', async () => {
    const user = userEvent.setup();
    function Host() {
      const toast = useToast();
      return <Button onPress={() => toast.show({ tone: 'error', title: 'Не сохранилось' })}>Показать</Button>;
    }
    render(
      <ToastProvider>
        <Host />
      </ToastProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Показать' }));
    expect(screen.getByRole('region', { name: 'Уведомления' })).toBeTruthy();
    expect(screen.getByText('Не сохранилось')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Скрыть уведомление' }));
    await vi.waitFor(() => expect(screen.queryByText('Не сохранилось')).toBeNull());
  });
});

describe('DataTable', () => {
  type Row = { id: string; name: string };
  const columns = [
    { id: 'name', header: 'Название', isRowHeader: true, allowsSorting: true, cell: (row: Row) => row.name }
  ];
  const rows: Row[] = [
    { id: 'a', name: 'Первый' },
    { id: 'b', name: 'Второй' }
  ];

  it('renders rows, reports sort and selection', async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    const onSelect = vi.fn();
    render(
      <DataTable
        aria-label="Публикации"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        sort={{ column: 'name', direction: 'ascending' }}
        onSortChange={onSort}
        selectionMode="multiple"
        selected={new Set()}
        onSelectionChange={onSelect}
      />
    );
    expect(screen.getByRole('grid', { name: 'Публикации' })).toBeTruthy();
    await user.click(screen.getByRole('columnheader', { name: /Название/ }));
    expect(onSort).toHaveBeenCalledWith({ column: 'name', direction: 'descending' });
    expect(screen.getByRole('checkbox', { name: /Выбрать все/ })).toBeTruthy();
    await user.click(screen.getAllByRole('checkbox', { name: /Выбрать/ })[0]!);
    expect(onSelect).toHaveBeenCalled();
  });

  it('shows the empty state and the loading skeleton', () => {
    const { rerender } = render(
      <DataTable
        aria-label="Список"
        columns={columns}
        rows={[]}
        getRowId={(row) => row.id}
        emptyState={<p>Ничего нет</p>}
      />
    );
    expect(screen.getByText('Ничего нет')).toBeTruthy();
    rerender(<DataTable aria-label="Список" columns={columns} rows={[]} getRowId={(row) => row.id} isLoading />);
    expect(screen.getByRole('grid').closest('[aria-busy="true"]')).toBeTruthy();
  });
});

describe('DateTimeField', () => {
  it('labels the zone with its offset and shows the UTC value', () => {
    const value = toZoned(new CalendarDateTime(2026, 10, 7, 14, 30), 'Europe/Chisinau');
    render(<DateTimeField label="Опубликовать" value={value} onChange={() => undefined} timeZone="Europe/Chisinau" />);
    expect(screen.getByText(/Часовой пояс: Europe\/Chisinau \(UTC\+3\)/)).toBeTruthy();
    expect(screen.getByText('В UTC: 2026-10-07 11:30 UTC')).toBeTruthy();
  });
});
