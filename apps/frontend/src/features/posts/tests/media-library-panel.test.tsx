import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createTestQueryClient } from '../../../test/query-wrapper';
import type { Entry } from '../model/media-entry';
import type { MediaLibrary } from '../model/use-media-library';
import { MediaLibraryPanel } from '../ui/MediaLibraryPanel';

vi.mock('../api/post-media-api', () => ({ getPostMediaContent: () => new Promise<Blob>(() => undefined) }));

const itemIds = Array.from({ length: 6 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`);
const items = itemIds.map((id, index) => ({
  id,
  kind: 'photo' as const,
  fileName: `Фото ${index}.jpg`,
  contentType: 'image/jpeg',
  sizeBytes: 1000,
  width: 10,
  height: 10,
  durationMs: null,
  createdAt: '2026-10-07T07:00:00.000Z',
  duplicateCount: 1,
  usageCount: 0,
  deletable: true,
  usages: []
}));

function entriesFor(count: number): Entry[] {
  return itemIds.slice(0, count).map((id, index) => ({
    key: id,
    status: 'uploaded' as const,
    media: {
      id,
      sourceMediaId: null,
      kind: 'photo' as const,
      fileName: `Фото ${index}.jpg`,
      contentType: 'image/jpeg',
      sizeBytes: 1000,
      width: 10,
      height: 10,
      durationMs: null,
      position: index
    }
  }));
}

function renderPanel(entries: Entry[], selection: string[] = [], disabled = false) {
  const library = {
    kind: 'all',
    items,
    cursor: null,
    selection,
    libraryBusy: false,
    error: '',
    errorAction: null,
    setSelection: vi.fn(),
    resetListing: vi.fn(),
    openLibrary: vi.fn(),
    attachSelected: vi.fn()
  } as unknown as MediaLibrary;
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MediaLibraryPanel library={library} entries={entries} busy={false} disabled={disabled} />
    </QueryClientProvider>
  );
}

describe('MediaLibraryPanel', () => {
  it('lets a file that is already in the post be picked again', () => {
    renderPanel(entriesFor(6));
    for (const [index] of itemIds.entries()) {
      const tile = screen.getByRole('button', { name: `Фото ${index}.jpg` }) as HTMLButtonElement;
      expect(tile.disabled).toBe(false);
    }
    expect(screen.getByText(/Можно добавить ещё 4 файла/)).toBeTruthy();
  });

  it('explains why unselected files are blocked at the 10-file limit', () => {
    renderPanel(entriesFor(6), itemIds.slice(0, 4));
    expect(screen.getByText(/не больше 10 файлов/)).toBeTruthy();
  });

  it('explains why nothing can be picked in a post that is not a draft', () => {
    renderPanel(entriesFor(2), [], true);
    expect(screen.getByText(/Пост нельзя изменять/)).toBeTruthy();
  });
});
