import type { AiFormatQualityDto, AiQualityDto } from '@alexeev/contracts';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatMinutes } from '../model/ai-view';
import { AiQualityByFormat, AiQualityComparison } from '../ui/AiQualityExtras';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const row = (patch: Partial<AiFormatQualityDto>): AiFormatQualityDto => ({
  format: 'fidit',
  drafts: 0,
  questions: 0,
  approved: 0,
  approvedUnchanged: 0,
  averageEditRatio: null,
  hookChangedShare: null,
  endingChangedShare: null,
  jokeMissed: 0,
  medianMinutesToApproval: null,
  ...patch
});

const ROWS = [
  row({
    format: 'fidit',
    drafts: 5,
    questions: 1,
    approved: 3,
    approvedUnchanged: 1,
    averageEditRatio: 0.254,
    hookChangedShare: 0.5,
    endingChangedShare: null,
    jokeMissed: 2,
    medianMinutesToApproval: 125
  }),
  row({ format: 'igrat', drafts: 1 }),
  row({ format: 'standalone' }),
  row({ format: 'telegram' })
];

describe('quality by format', () => {
  it('formats minutes', () => {
    expect(formatMinutes(null)).toBe('—');
    expect(formatMinutes(12)).toBe('12 мин');
    expect(formatMinutes(125)).toBe('2 ч 5 мин');
    expect(formatMinutes(120)).toBe('2 ч');
  });

  it('shows table values, dashes for null, and collapses idle formats', () => {
    render(<AiQualityByFormat rows={ROWS} />);
    const table = screen.getByRole('grid', { name: 'Качество по форматам' });
    // Wide: formats are columns, metrics are rows.
    const header = within(table)
      .getAllByRole('columnheader')
      .map((cell) => cell.textContent);
    expect(header).toEqual(['Показатель', 'Учу фидить', 'Учусь играть']);
    const values = (metric: string) =>
      within(within(table).getByRole('row', { name: new RegExp(metric) }))
        .getAllByRole('gridcell')
        .map((cell) => cell.textContent);
    expect(values('Черновики')).toEqual(['5', '1']);
    expect(values('Правки')).toEqual(['25%', '—']);
    expect(values('Концовка')).toEqual(['—', '—']);
    expect(values('Шутка')).toEqual(['2', '0']);
    expect(values('Время')).toEqual(['2 ч 5 мин', '—']);
    expect(screen.getByText('Нет черновиков: Рилс, Пост в ТГ')).toBeTruthy();
  });

  it('shows one card per format on a phone', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    }));
    render(<AiQualityByFormat rows={ROWS} />);
    expect(screen.queryByRole('grid')).toBeNull();
    const cards = within(screen.getByRole('list', { name: 'Качество по форматам' })).getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]!).getByText('Время до одобрения')).toBeTruthy();
    expect(within(cards[0]!).getByText('2 ч 5 мин')).toBeTruthy();
  });

  it('renders nothing without the field', () => {
    const { container } = render(<AiQualityByFormat rows={undefined} />);
    expect(container.innerHTML).toBe('');
  });
});

const quality = (patch: Partial<AiQualityDto>) => ({ days: 30, averageEditRatio: 0.2, ...patch }) as AiQualityDto;

describe('comparison with the previous period', () => {
  it('shows the numbers and a neutral direction when comparable', () => {
    render(
      <AiQualityComparison
        quality={quality({ previous: { approved: 14, averageEditRatio: 0.31, comparable: true } })}
      />
    );
    expect(
      screen.getByText('За прошлые 30 дней: одобрено 14, правок в среднем 31% · сейчас правок меньше')
    ).toBeTruthy();
  });

  it('says the periods cannot be compared yet', () => {
    render(
      <AiQualityComparison quality={quality({ previous: { approved: 3, averageEditRatio: 0.3, comparable: false } })} />
    );
    expect(screen.getByText('Для сравнения нужно не меньше 10 одобренных текстов за каждый период')).toBeTruthy();
  });

  it('renders nothing from an older server', () => {
    const { container } = render(<AiQualityComparison quality={quality({})} />);
    expect(container.innerHTML).toBe('');
  });
});
