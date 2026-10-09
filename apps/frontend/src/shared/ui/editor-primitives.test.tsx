import { Time } from '@internationalized/date';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fitFrame, moveFrame, resizeFromCorner } from './crop-frame';
import {
  ActionRow,
  BottomSheet,
  CropCanvas,
  FormatToolbar,
  MediaAddTile,
  MediaGridTile,
  MediaListRow,
  Panel,
  ProgressBar,
  ProgressRing,
  RatioTileGroup,
  Slider,
  Switch,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  TelegramPreview,
  TimeField,
  UploadRow
} from './index';

afterEach(cleanup);

describe('Panel variants', () => {
  it('keeps the bordered surface as the default and supports a plain content group', () => {
    const { rerender, container } = render(<Panel>Fields</Panel>);
    const panel = container.querySelector('section');
    expect(panel?.getAttribute('data-variant')).toBe('surface');

    rerender(<Panel variant="plain">Fields</Panel>);
    expect(panel?.getAttribute('data-variant')).toBe('plain');
  });
});

const STAGE = { width: 400, height: 300 };

describe('crop frame geometry', () => {
  it('keeps a moved frame inside the stage', () => {
    expect(moveFrame({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, 2, -2)).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.5 });
  });

  it('resizes from a corner against the opposite corner and keeps the minimum', () => {
    const frame = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 };
    const grown = resizeFromCorner(frame, 'bottom-right', 0.9, 0.7, STAGE, 0.1);
    expect([grown.x, grown.y, grown.w, grown.h]).toEqual([0.2, 0.2, 0.7, expect.closeTo(0.5)]);
    const tiny = resizeFromCorner(frame, 'bottom-right', 0.21, 0.21, STAGE, 0.1);
    expect(tiny.w).toBeCloseTo(0.1);
    expect(tiny.h).toBeCloseTo(0.1);
    expect(tiny.x).toBe(0.2);
  });

  it('holds a locked ratio and stays inside the stage', () => {
    const next = resizeFromCorner({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, 'top-left', 0, 0, STAGE, 0.1, 1);
    expect((next.w * STAGE.width) / (next.h * STAGE.height)).toBeCloseTo(1);
    expect(next.x).toBeGreaterThanOrEqual(0);
    expect(next.y).toBeGreaterThanOrEqual(0);
    expect(next.x + next.w).toBeCloseTo(0.75);
  });

  it('fits the largest centred frame of a ratio', () => {
    const wide = fitFrame(16 / 9, STAGE);
    expect(wide.w).toBe(1);
    expect((wide.w * STAGE.width) / (wide.h * STAGE.height)).toBeCloseTo(16 / 9);
    expect(wide.y).toBeCloseTo((1 - wide.h) / 2);
  });
});

describe('MediaGridTile', () => {
  it('keeps preview and removal as separately named sibling actions', () => {
    const { container } = render(
      <MediaGridTile
        label="altai_lake.jpg"
        onPress={() => undefined}
        onRemove={() => undefined}
        removeLabel="Убрать из поста: altai_lake.jpg"
      />
    );
    const preview = screen.getByRole('button', { name: 'altai_lake.jpg' });
    const remove = screen.getByRole('button', { name: 'Убрать из поста: altai_lake.jpg' });
    expect(preview.parentElement).toBe(container.firstElementChild);
    expect(remove.parentElement).toBe(container.firstElementChild);
    expect(preview.contains(remove)).toBe(false);
  });

  it('keeps the drag handle outside the preview hit area and independently operable', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    const onMove = vi.fn();
    const onRemove = vi.fn();
    const { container } = render(
      <MediaGridTile
        label="altai_lake.jpg"
        onPress={onPress}
        handle={
          <button type="button" aria-label="Move altai_lake.jpg" onClick={onMove}>
            Move
          </button>
        }
        onRemove={onRemove}
        removeLabel="Remove altai_lake.jpg"
      />
    );
    const preview = screen.getByRole('button', { name: 'altai_lake.jpg' });
    const handle = screen.getByRole('button', { name: 'Move altai_lake.jpg' });
    const remove = screen.getByRole('button', { name: 'Remove altai_lake.jpg' });
    const tile = container.firstElementChild;

    expect(tile?.getAttribute('data-has-handle')).toBe('true');
    expect(handle.parentElement?.parentElement).toBe(tile);
    expect(preview.parentElement).toBe(tile);
    expect(remove.parentElement).toBe(tile);
    expect(preview.contains(handle)).toBe(false);
    expect(preview.contains(remove)).toBe(false);

    await user.click(handle);
    await user.click(preview);
    await user.click(remove);
    expect([onMove, onPress, onRemove].map((action) => action.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it('opens, removes and retries through named buttons', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    const onRemove = vi.fn();
    const onRetry = vi.fn();
    render(
      <MediaGridTile
        label="altai_lake.jpg"
        state="failed"
        stateLabel="Ошибка"
        onPress={onPress}
        onRemove={onRemove}
        removeLabel="Убрать altai_lake.jpg"
        onRetry={onRetry}
        retryLabel="Повторить загрузку"
      />
    );
    expect(screen.getByText('Ошибка')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'altai_lake.jpg' }));
    await user.click(screen.getByRole('button', { name: 'Убрать altai_lake.jpg' }));
    await user.click(screen.getByRole('button', { name: 'Повторить загрузку' }));
    expect([onPress, onRemove, onRetry].map((fn) => fn.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it('shows progress as a named progressbar and a selectable tile as a toggle', async () => {
    const user = userEvent.setup();
    const onSelectedChange = vi.fn();
    const { rerender } = render(
      <MediaGridTile
        label="video.mp4"
        kind="video"
        duration="01:24"
        state="uploading"
        progress={65}
        stateLabel="Загрузка"
      />
    );
    expect(screen.getByRole('progressbar', { name: 'Загрузка' }).getAttribute('aria-valuenow')).toBe('65');
    expect(screen.getByText('01:24')).toBeTruthy();
    rerender(<MediaGridTile label="lake.jpg" selectable isSelected={false} onSelectedChange={onSelectedChange} />);
    await user.click(screen.getByRole('button', { name: 'lake.jpg' }));
    expect(onSelectedChange).toHaveBeenCalledWith(true);
  });

  it('exposes a fluid 4:3 frame while leaving the default frame square', () => {
    const { container, rerender } = render(<MediaGridTile label="square.jpg" fluid />);
    const tile = container.firstElementChild;
    expect(tile?.getAttribute('data-fluid')).toBe('true');
    expect(tile?.getAttribute('data-aspect-ratio')).toBe('square');

    rerender(<MediaGridTile label="editor_media.jpg" fluid aspectRatio="4:3" />);
    expect(container.firstElementChild?.getAttribute('data-aspect-ratio')).toBe('4:3');
  });

  it('renders the add tile', async () => {
    const onPress = vi.fn();
    render(<MediaAddTile label="Добавить файлы" onPress={onPress} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Добавить файлы' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('rows', () => {
  it('MediaListRow removes by its label', async () => {
    const onRemove = vi.fn();
    render(<MediaListRow name="mountains.jpg" meta="4.2 МБ" onRemove={onRemove} removeLabel="Убрать mountains.jpg" />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Убрать mountains.jpg' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('UploadRow carries the status in text and a bar for uploading', () => {
    render(<UploadRow name="sunrise.mp4" kind="video" state="uploading" progress={62} statusLabel="Загрузка…" />);
    expect(screen.getByText('Загрузка…')).toBeTruthy();
    expect(screen.getByText('62%')).toBeTruthy();
    expect(screen.getAllByRole('progressbar').length).toBe(2);
  });
});

describe('progress', () => {
  it('rounds the ring value and supports indeterminate', () => {
    const { rerender } = render(<ProgressRing label="Загрузка" value={64.6} />);
    expect(screen.getByText('65%')).toBeTruthy();
    rerender(<ProgressBar label="Загрузка" />);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBeNull();
  });
});

describe('RatioTileGroup', () => {
  it('names tiles in full and moves selection with arrows', async () => {
    const user = userEvent.setup();
    function Host() {
      const [value, setValue] = useState('original');
      return (
        <RatioTileGroup
          label="Соотношение сторон"
          value={value}
          onChange={setValue}
          options={[
            { id: 'original', label: 'Оригинал', shortLabel: 'Ориг.', shape: 3 / 4 },
            { id: '1:1', label: '1:1', shape: 1 },
            { id: '16:9', label: '16:9', shape: 16 / 9 }
          ]}
        />
      );
    }
    render(<Host />);
    const original = screen.getByRole('radio', { name: 'Оригинал' }) as HTMLInputElement;
    expect(original.checked).toBe(true);
    original.focus();
    await user.keyboard('{ArrowRight}');
    expect((screen.getByRole('radio', { name: '1:1' }) as HTMLInputElement).checked).toBe(true);
  });
});

describe('Slider', () => {
  it('steps with the round buttons and clamps at the ends', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Slider
        label="Масштаб"
        value={1}
        onChange={onChange}
        min={1}
        max={4}
        step={0.05}
        stepperStep={0.25}
        decrementLabel="Уменьшить"
        incrementLabel="Увеличить"
        valueFormat={{ style: 'percent' }}
      />
    );
    expect(screen.getByRole('slider', { name: /Масштаб/ }).getAttribute('aria-valuetext')).toBe('100%');
    expect((screen.getByRole('button', { name: 'Уменьшить' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Увеличить' }));
    expect(onChange).toHaveBeenCalledWith(1.25);
  });
});

describe('FormatToolbar', () => {
  it('toggles, acts and exposes toolbar semantics', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <FormatToolbar
        label="Форматирование"
        overflowLabel="Ещё"
        onAction={onAction}
        items={[
          { id: 'bold', icon: 'bold', label: 'Жирный', kind: 'toggle', isSelected: true },
          { id: 'link', icon: 'link', label: 'Ссылка', kind: 'toggle', separatorBefore: true },
          { id: 'undo', icon: 'undo', label: 'Отменить', kind: 'action', end: true }
        ]}
      />
    );
    expect(screen.getByRole('toolbar', { name: 'Форматирование' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Жирный' }).getAttribute('aria-pressed')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Отменить' }));
    expect(onAction).toHaveBeenCalledWith('undo');
  });
});

describe('TelegramPreview media', () => {
  const media = [
    { id: 'a', src: 'a.jpg' },
    { id: 'b', src: 'b.jpg' }
  ];
  const labels = {
    previous: 'Назад',
    next: 'Дальше',
    loadFailed: 'Не удалось загрузить',
    retry: 'Повторить',
    region: 'Медиа поста'
  };

  it('pages the carousel and shows the counter', async () => {
    const user = userEvent.setup();
    render(<TelegramPreview body="Текст" views="0" meta="сейчас" media={media} mediaLabels={labels} showCounter />);
    expect(screen.getByText('1 / 2')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Назад' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(screen.getByText('2 / 2')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Назад' })).toBeTruthy();
  });

  it('shows a retry placeholder when a picture fails', async () => {
    const { container } = render(<TelegramPreview body="Текст" media={media} mediaLabels={labels} />);
    container.querySelector('img')?.dispatchEvent(new Event('error'));
    expect(await screen.findByText('Не удалось загрузить')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeTruthy();
  });
});

describe('Tabs card variant and Switch row', () => {
  it('renders title and hint in a tab and selects it', async () => {
    const user = userEvent.setup();
    render(
      <Tabs variant="card">
        <TabList aria-label="Источник">
          <Tab id="pc" icon="laptop" hint="Загрузите файлы с устройства">
            С компьютера
          </Tab>
          <Tab id="lib" icon="image" hint="Ваши сохранённые файлы">
            Медиабиблиотека
          </Tab>
        </TabList>
        <TabPanel id="pc">A</TabPanel>
        <TabPanel id="lib">B</TabPanel>
      </Tabs>
    );
    expect(screen.getByText('Загрузите файлы с устройства')).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: /Медиабиблиотека/ }));
    expect(screen.getByText('B')).toBeTruthy();
  });

  it('keeps the row switch a named switch', async () => {
    const onChange = vi.fn();
    render(
      <Switch variant="row" icon="bell" onChange={onChange}>
        Уведомлять подписчиков
      </Switch>
    );
    await userEvent.setup().click(screen.getByRole('switch', { name: 'Уведомлять подписчиков' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('TimeField stepper', () => {
  it('moves the time by the step and wraps the day', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TimeField
        label="Время"
        hideLabel
        icon="clock"
        value={new Time(23, 58)}
        onChange={onChange}
        stepper={{ incrementLabel: 'Позже', decrementLabel: 'Раньше' }}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Позже' }));
    expect(onChange.mock.calls[0]?.[0].toString()).toBe('00:03:00');
    await user.click(screen.getByRole('button', { name: 'Раньше' }));
    expect(onChange.mock.calls[1]?.[0].toString()).toBe('23:53:00');
  });
});

describe('BottomSheet and CropCanvas', () => {
  it('opens a titled sheet and presses an action row', async () => {
    const onPress = vi.fn();
    render(
      <BottomSheet isOpen onOpenChange={() => undefined} title="Добавить фото и видео">
        <ActionRow icon="camera" title="Снять фото" hint="Открыть камеру устройства" onPress={onPress} />
      </BottomSheet>
    );
    expect(screen.getByRole('dialog', { name: 'Добавить фото и видео' })).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: /Снять фото/ }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('moves the frame and a corner from the keyboard', async () => {
    const user = userEvent.setup();
    const onFrameChange = vi.fn();
    render(
      <CropCanvas
        src="lake.png"
        imageAspect={4 / 3}
        frame={{ x: 0.2, y: 0.2, w: 0.5, h: 0.5 }}
        onFrameChange={onFrameChange}
        labels={{
          region: 'Область кадрирования',
          corners: {
            'top-left': 'Левый верхний угол',
            'top-right': 'Правый верхний угол',
            'bottom-left': 'Левый нижний угол',
            'bottom-right': 'Правый нижний угол'
          }
        }}
      />
    );
    screen.getByRole('application', { name: 'Область кадрирования' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(onFrameChange.mock.calls[0]?.[0].x).toBeCloseTo(0.21);
    screen.getByRole('button', { name: 'Правый нижний угол' }).focus();
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(onFrameChange.mock.calls[1]?.[0].w).toBeCloseTo(0.6);
  });
});
