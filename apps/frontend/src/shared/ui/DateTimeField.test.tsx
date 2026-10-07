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

function Harness({ initial }: { initial: ZonedDateTime | null }) {
  const [value, setValue] = useState<ZonedDateTime | null>(initial);
  return (
    <>
      <DateTimeField label="Опубликовать" value={value} onChange={setValue} timeZone={ZONE} />
      <output data-testid="out">{value ? value.toString() : 'empty'}</output>
    </>
  );
}

const out = () => screen.getByTestId('out').textContent;

describe('DateTimeField time picker', () => {
  it('sets hour and minute by taps and keeps the time when the date changes', async () => {
    const user = userEvent.setup();
    render(<Harness initial={toZoned(new CalendarDateTime(2027, 3, 10, 14, 30), ZONE)} />);
    await user.click(screen.getByRole('button', { name: /календар/i }));
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: 'Часы: на 1 больше' }));
    await user.click(within(dialog).getByRole('button', { name: 'Минуты: на 5 больше' }));
    expect(out()).toContain('2027-03-10T15:35');

    await user.click(within(dialog).getByRole('button', { name: 'Минуты: 45' }));
    expect(out()).toContain('2027-03-10T15:45');

    await user.click(within(dialog).getByRole('button', { name: /15 марта/ }));
    expect(out()).toContain('2027-03-15T15:45');

    await user.click(within(dialog).getByRole('button', { name: 'Готово' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('seeds a round default time for an empty value and commits on choosing a date', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-07T06:50:00Z') });
    const user = userEvent.setup();
    render(<Harness initial={null} />);
    await user.click(screen.getByRole('button', { name: /календар/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('group', { name: 'Время' }).textContent).toContain('10:00');
    await user.click(within(dialog).getByRole('button', { name: 'Минуты: 30' }));
    await user.click(within(dialog).getByRole('button', { name: /20 октября/ }));
    expect(out()).toContain('2026-10-20T10:30:00+03:00[Europe/Chisinau]');
  });

  it('works by keyboard and returns focus to the trigger on Escape', async () => {
    const user = userEvent.setup();
    render(<Harness initial={toZoned(new CalendarDateTime(2027, 3, 10, 14, 30), ZONE)} />);
    const trigger = screen.getByRole('button', { name: /календар/i });
    trigger.focus();
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog');
    const plus = within(dialog).getByRole('button', { name: 'Часы: на 1 больше' });
    plus.focus();
    await user.keyboard('{Enter}');
    expect(out()).toContain('T15:30');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
