import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Button,
  Checkbox,
  ColorField,
  IconButton,
  Radio,
  RadioGroup,
  SearchField,
  SegmentedControl,
  Select,
  Switch,
  TextArea,
  TextField
} from './index';

afterEach(cleanup);

describe('Button', () => {
  it('presses, and ignores presses while loading', async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();
    const { rerender } = render(<Button onPress={onPress}>Сохранить</Button>);
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    rerender(
      <Button onPress={onPress} isLoading>
        Сохранить
      </Button>
    );
    await user.click(screen.getByRole('button', { name: /Сохранить/ }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Сохранить/ }).getAttribute('aria-disabled')).toBe('true');
  });

  it('does not press when disabled', async () => {
    const onPress = vi.fn();
    render(
      <Button onPress={onPress} isDisabled>
        Отправить
      </Button>
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Отправить' }));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('IconButton', () => {
  it('is named by its label', () => {
    render(<IconButton label="Удалить" icon="trash" />);
    expect(screen.getByRole('button', { name: 'Удалить' })).toBeTruthy();
  });
});

describe('TextField and TextArea', () => {
  it('links the error message to the input and marks it invalid', () => {
    render(<TextField label="Заголовок" errorMessage="Введите заголовок" />);
    const input = screen.getByRole('textbox', { name: 'Заголовок' });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText('Введите заголовок')).toBeTruthy();
  });

  it('counts characters and flags the excess without truncating', async () => {
    const user = userEvent.setup();
    render(<TextArea label="Текст" limit={5} />);
    const area = screen.getByRole('textbox', { name: 'Текст' });
    await user.type(area, 'abcdefg');
    expect((area as HTMLTextAreaElement).value).toBe('abcdefg');
    expect(screen.getByText('7 / 5')).toBeTruthy();
    expect(screen.getByText('Превышен лимит на 2')).toBeTruthy();
    expect(area.getAttribute('aria-invalid')).toBe('true');
  });
});

describe('counter on the label row', () => {
  it('announces politely only near the limit and renders a toolbar inside the box', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <TextArea label="Текст" limit={10} limitPlacement="label" toolbar={<button type="button">Жирный</button>} />
    );
    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toBe('');
    await user.type(screen.getByRole('textbox', { name: 'Текст' }), '123456789');
    expect(live?.textContent).toBe('9 / 10');
    expect(screen.getByRole('button', { name: 'Жирный' })).toBeTruthy();
  });

  it('TextField shows a custom counter slot', () => {
    render(<TextField label="Заголовок" counter="58 / 200" />);
    expect(screen.getByText('58 / 200')).toBeTruthy();
  });
});

describe('SearchField', () => {
  it('clears with the button', async () => {
    const user = userEvent.setup();
    render(<SearchField label="Поиск" defaultValue="патч" />);
    await user.click(screen.getByRole('button', { name: 'Очистить поиск' }));
    expect((screen.getByRole('searchbox', { name: 'Поиск' }) as HTMLInputElement).value).toBe('');
  });
});

describe('Select', () => {
  it('picks an option with the keyboard and skips disabled ones', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    function Host() {
      const [value, setValue] = useState<string | null>('a');
      return (
        <Select
          label="Канал"
          value={value}
          onChange={(id) => {
            onChange(id);
            setValue(id);
          }}
          options={[
            { id: 'a', label: 'Первый' },
            { id: 'b', label: 'Второй', isDisabled: true },
            { id: 'c', label: 'Третий' }
          ]}
        />
      );
    }
    render(<Host />);
    await user.click(screen.getByRole('button', { name: /Первый/ }));
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith('c');
  });
});

describe('Checkbox, Switch, RadioGroup, SegmentedControl', () => {
  it('toggles checkbox and switch with Space', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Checkbox>Согласен</Checkbox>
        <Switch>Включено</Switch>
      </>
    );
    await user.tab();
    await user.keyboard(' ');
    expect(screen.getByRole('checkbox', { name: 'Согласен' })).toHaveProperty('checked', true);
    await user.tab();
    await user.keyboard(' ');
    expect(screen.getByRole('switch', { name: 'Включено' })).toHaveProperty('checked', true);
  });

  it('moves a radio card selection with arrows', async () => {
    const user = userEvent.setup();
    render(
      <RadioGroup label="Публикация" variant="card" defaultValue="now">
        <Radio value="now" description="Сразу">
          Сейчас
        </Radio>
        <Radio value="later">Позже</Radio>
      </RadioGroup>
    );
    await user.tab();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: 'Позже' })).toHaveProperty('checked', true);
  });

  it('segmented control is a radio group', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Вид"
        value="day"
        onChange={onChange}
        options={[
          { id: 'day', label: 'День' },
          { id: 'week', label: 'Неделя' }
        ]}
      />
    );
    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith('week');
    expect(screen.getByRole('radiogroup', { name: 'Вид' })).toBeTruthy();
  });
});

describe('ColorField', () => {
  it('reports only valid colours and shows an error for the rest', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ColorField label="Цвет" value="#112233" onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: 'Цвет' });
    await user.clear(input);
    await user.type(input, '#12');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Введите цвет в формате #RRGGBB')).toBeTruthy();
    await user.type(input, '3456');
    expect(onChange).toHaveBeenLastCalledWith('#123456');
  });
});
