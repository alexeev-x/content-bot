import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@testing-library/react';
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { createWrapper } from '../../test/query-wrapper';
import { CommandPalette } from './CommandPalette';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }));
vi.mock('../../features/posts', () => ({
  postsInfiniteQueryOptions: (filters: { q?: string }) =>
    infiniteQueryOptions({
      queryKey: ['palette-posts', filters],
      queryFn: () => Promise.resolve({ items: [{ id: 'p1', title: 'Патч 7.40' }] }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: () => undefined
    })
}));
vi.mock('../../features/publications', () => ({
  publicationsPageQueryOptions: (filters: { q?: string }) =>
    queryOptions({ queryKey: ['palette-pubs', filters], queryFn: () => Promise.resolve({ items: [] }) })
}));

describe('CommandPalette', () => {
  it('opens a found post and closes', async () => {
    const onOpenChange = vi.fn();
    render(<CommandPalette isOpen onOpenChange={onOpenChange} />, { wrapper: createWrapper() });
    await userEvent.type(screen.getByRole('searchbox'), 'Патч');
    await userEvent.click(await screen.findByRole('option', { name: 'Патч 7.40' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/posts/$id', params: { id: 'p1' } }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
