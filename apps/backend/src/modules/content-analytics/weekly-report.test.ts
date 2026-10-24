import { describe, expect, it } from 'vitest';
import { rubricWeek, type WeeklyData } from './weekly-report';

// The rubric line of the Monday report (owner 19.10.2026: «какие рубрики заходят»): a median over strong
// comparisons only, never a guess for a rubric without one.

const cell = (views: number, median: number, weak = false) => ({
  platform: 'youtube' as const,
  itemId: 'i',
  url: 'u',
  views,
  comparison: { ageHours: 72, views, median, low: 1, high: 2, items: 6, weak }
});

const data = (videos: WeeklyData['videos']): WeeklyData => ({
  kind: 'weekly',
  weekStart: 0,
  weekEnd: 1,
  published: videos.length,
  publishedBefore: 0,
  followers: [],
  goals: [],
  videos,
  posts: []
});

describe('rubricWeek', () => {
  it('takes the median per rubric over strong comparisons and leaves out a rubric without one', () => {
    const rows = rubricWeek(
      data([
        { key: 'V1', title: 'a', format: 'igrat', publishedAt: 1, cells: [cell(1800, 1000), cell(900, 1000)] },
        { key: 'V2', title: 'b', format: 'igrat', publishedAt: 1, cells: [cell(1500, 1000)] },
        { key: 'V3', title: 'c', format: 'fidit', publishedAt: 1, cells: [cell(500, 1000, true)] }
      ])
    );
    expect(rows).toEqual([{ format: 'igrat', percent: 50, cells: 3 }]);
  });
});
