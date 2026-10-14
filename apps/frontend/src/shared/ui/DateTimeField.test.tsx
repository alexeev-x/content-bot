import { CalendarDateTime, toZoned, type ZonedDateTime } from '@internationalized/date';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DateTimeField } from './DateTimeField';

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const ZONE = 'Europe/Chisinau';

function Harness({ initial, minValue }: { initial: ZonedDateTime | null; minValue?: ZonedDateTime }) {
  const [value, setValue] = useState<ZonedDateTime | null>(initial);
  return (
    <>
      <DateTimeField label="Опубликовать" value={value} onChange={setValue} timeZone={ZONE} minValue={minValue} />
      <output data-testid="out">{value ? value.toString() : 'empty'}</output>
    </>
  );
}

const out = () => screen.getByTestId('out').textContent;

function firstCalendarButton(dialog: HTMLElement, name: RegExp): HTMLElement {
  const button = within(dialog).getAllByRole('button', { name }).at(0);
  if (!button) throw new Error(`No calendar button matched ${name}`);
  return button;
}

describe('DateTimeField time picker', () => {
  it('blocks a spring-forward gap without emitting a zoned value', async () => {
    const user = userEvent.setup();
    const initial = toZoned(new CalendarDateTime(2026, 3, 28, 3, 30), ZONE);
    render(<Harness initial={initial} />);
    await user.click(screen.getByRole('button', { name: /Открыть календарь/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(firstCalendarButton(dialog, /29 марта/));
    expect(within(dialog).getByRole('alert').textContent).toMatch(/Этого времени нет/);
    expect(within(dialog).getByRole('button', { name: 'Готово' }).hasAttribute('disabled')).toBe(true);
    expect(out()).toContain('2026-03-28T03:30');
  });

  it('requires an explicit occurrence for a fold and commits the selected UTC instant', async () => {
    const user = userEvent.setup();
    const initial = toZoned(new CalendarDateTime(2026, 10, 24, 3, 30), ZONE);
    render(<Harness initial={initial} />);
    await user.click(screen.getByRole('button', { name: /Открыть календарь/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(firstCalendarButton(dialog, /25 октября/));
    const options = within(dialog).getAllByRole('radio');
    expect(options).toHaveLength(2);
    expect((options[0] as HTMLInputElement | undefined)?.checked).toBe(false);
    expect((options[1] as HTMLInputElement | undefined)?.checked).toBe(false);
    expect(within(dialog).getByText(/UTC\+3/)).toBeTruthy();
    expect(within(dialog).getByText(/UTC\+2/)).toBeTruthy();
    const done = within(dialog).getByRole('button', { name: 'Готово' });
    expect(done.hasAttribute('disabled')).toBe(true);
    expect(out()).toContain('2026-10-24T03:30');
    const firstOption = options[0];
    if (!firstOption) throw new Error('First occurrence option is missing');
    await user.click(firstOption);
    expect(done.hasAttribute('disabled')).toBe(false);
    await user.click(done);
    expect(out()).toContain('2026-10-25T03:30:00+03:00[Europe/Chisinau]');

    await user.click(screen.getByRole('button', { name: /Открыть календарь/i }));
    const nextDialog = await screen.findByRole('dialog');
    await user.click(firstCalendarButton(nextDialog, /24 октября/));
    await user.click(firstCalendarButton(nextDialog, /25 октября/));
    const secondOption = within(nextDialog).getAllByRole('radio')[1];
    if (!secondOption) throw new Error('Second occurrence option is missing');
    await user.click(secondOption);
    await user.click(within(nextDialog).getByRole('button', { name: 'Готово' }));
    expect(out()).toContain('2026-10-25T03:30:00+02:00[Europe/Chisinau]');
  });

  it('edits date and time together, commits only on Done, and reopens the saved value', async () => {
    const user = userEvent.setup();
    render(<Harness initial={toZoned(new CalendarDateTime(2027, 3, 10, 14, 30), ZONE)} />);
    await user.click(screen.getByRole('button', { name: /календар/i }));
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Часы: на 1 больше' }));
    await user.click(within(dialog).getByRole('button', { name: 'Минуты: на 5 больше' }));
    expect(out()).toContain('2027-03-10T14:30');

    await user.click(within(dialog).getByRole('button', { name: 'Минуты: 45' }));
    await user.click(firstCalendarButton(dialog, /15 марта/));
    expect(within(dialog).getByText(/15 марта 2027 · 15:45/)).toBeTruthy();
    expect(out()).toContain('2027-03-10T14:30');

    await user.click(within(dialog).getByRole('button', { name: 'Готово' }));
    expect(out()).toContain('2027-03-15T15:45');
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: /календар/i }));
    expect(within(await screen.findByRole('dialog')).getByText(/15 марта 2027 · 15:45/)).toBeTruthy();
  });

  it('seeds the next quarter-hour for an empty value and keeps changes as a draft', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-07T06:50:00Z') });
    const user = userEvent.setup();
    render(<Harness initial={null} />);
    await user.click(screen.getByRole('button', { name: /календар/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('textbox', { name: 'Часы' }).getAttribute('value')).toBe('10');
    await user.click(within(dialog).getByRole('button', { name: 'Минуты: 30' }));
    await user.click(firstCalendarButton(dialog, /20 октября/));
    expect(out()).toBe('empty');
    await user.click(within(dialog).getByRole('button', { name: 'Готово' }));
    expect(out()).toContain('2026-10-20T10:30:00+03:00[Europe/Chisinau]');
  });

  it('discards changes on Cancel or Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<Harness initial={toZoned(new CalendarDateTime(2027, 3, 10, 14, 30), ZONE)} />);
    const trigger = screen.getByRole('button', { name: /календар/i });
    trigger.focus();
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog');
    const plus = within(dialog).getByRole('button', { name: 'Часы: на 1 больше' });
    await user.click(plus);
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }));
    expect(out()).toContain('T14:30');
    await user.click(trigger);
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Часы: на 1 больше' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(out()).toContain('T14:30');
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    await user.click(trigger);
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Минуты: 45' }));
    await user.click(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(out()).toContain('T14:30');
  });

  it('accepts direct hour/minute input and carries five-minute steps across the hour', async () => {
    const user = userEvent.setup();
    render(<Harness initial={toZoned(new CalendarDateTime(2027, 3, 10, 16, 55), ZONE)} />);
    await user.click(screen.getByRole('button', { name: /календар/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Минуты: на 5 больше' }));
    expect(within(dialog).getByText(/17:00/)).toBeTruthy();
    await user.clear(within(dialog).getByRole('textbox', { name: 'Часы' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Часы' }), '21');
    await user.clear(within(dialog).getByRole('textbox', { name: 'Минуты' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Минуты' }), '10');
    expect(within(dialog).getByText(/21:10/)).toBeTruthy();
    await user.clear(within(dialog).getByRole('textbox', { name: 'Часы' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Часы' }), '25');
    expect((within(dialog).getByRole('textbox', { name: 'Часы' }) as HTMLInputElement).value).toBe('21');
    await user.click(within(dialog).getByRole('button', { name: 'Готово' }));
    expect(out()).toContain('T21:10');
  });

  it('uses direct numeric input without a list and confirms a one-digit hour with Enter', async () => {
    const user = userEvent.setup();
    render(<Harness initial={toZoned(new CalendarDateTime(2027, 3, 10, 14, 30), ZONE)} />);
    await user.click(screen.getByRole('button', { name: /календар/i }));
    const dialog = await screen.findByRole('dialog');
    const hour = within(dialog).getByRole('textbox', { name: 'Часы' });
    await user.click(hour);
    expect(within(dialog).queryByRole('listbox')).toBeNull();
    await user.clear(hour);
    await user.type(hour, '9');
    await user.keyboard('{Enter}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(out()).toContain('T09:30');
  });

  it('switches months without changing the selected time and updates the DST offset for a new day', async () => {
    const user = userEvent.setup();
    render(<Harness initial={toZoned(new CalendarDateTime(2026, 10, 7, 14, 0), ZONE)} />);
    await user.click(screen.getByRole('button', { name: /календар/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(firstCalendarButton(dialog, /Далее/));
    expect(within(dialog).getByText(/7 октября 2026 · 14:00/)).toBeTruthy();
    await user.click(firstCalendarButton(dialog, /Назад/));
    await user.click(firstCalendarButton(dialog, /30 октября/));
    expect(within(dialog).getByText(/30 октября 2026 · 14:00/)).toBeTruthy();
    expect(within(dialog).getAllByText('UTC+2').length).toBeGreaterThan(0);
  });

  it('moves a past time on the current day to the next allowed quarter-hour', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-07T13:20:00Z') });
    const user = userEvent.setup();
    render(
      <Harness
        initial={toZoned(new CalendarDateTime(2026, 10, 7, 16, 30), ZONE)}
        minValue={toZoned(new CalendarDateTime(2026, 10, 7, 16, 20), ZONE)}
      />
    );
    await user.click(screen.getByRole('button', { name: /календар/i }));
    const dialog = await screen.findByRole('dialog');
    await user.clear(within(dialog).getByRole('textbox', { name: 'Часы' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Часы' }), '15');
    expect(within(dialog).getByText(/16:30/)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Готово' }));
    expect(out()).toContain('T16:30');
  });

  it('disables quick minutes that would schedule in the past and enables them after changing the day', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-07T13:20:00Z') });
    const user = userEvent.setup();
    render(
      <Harness
        initial={toZoned(new CalendarDateTime(2026, 10, 7, 16, 30), ZONE)}
        minValue={toZoned(new CalendarDateTime(2026, 10, 7, 16, 20), ZONE)}
      />
    );
    await user.click(screen.getByRole('button', { name: /календар/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Минуты: 00' }).hasAttribute('disabled')).toBe(true);
    expect(within(dialog).getByRole('button', { name: 'Минуты: 15' }).hasAttribute('disabled')).toBe(true);
    expect(within(dialog).getByRole('button', { name: 'Минуты: 30' }).hasAttribute('disabled')).toBe(false);
    expect(within(dialog).getByRole('button', { name: 'Минуты: 45' }).hasAttribute('disabled')).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: 'Минуты: 00' }));
    expect(within(dialog).getByText(/7 октября 2026 · 16:30/)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Часы: на 1 больше' }));
    expect(within(dialog).getByRole('button', { name: 'Минуты: 00' }).hasAttribute('disabled')).toBe(false);
    await user.click(within(dialog).getByRole('button', { name: 'Часы: на 1 меньше' }));
    await user.click(firstCalendarButton(dialog, /8 октября/));
    expect(within(dialog).getByRole('button', { name: 'Минуты: 00' }).hasAttribute('disabled')).toBe(false);
    expect(within(dialog).getByRole('button', { name: 'Минуты: 15' }).hasAttribute('disabled')).toBe(false);
  });
});
