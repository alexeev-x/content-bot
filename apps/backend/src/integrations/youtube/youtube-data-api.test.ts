import { describe, expect, it } from 'vitest';
import { fetchYouTubeChannelStats, YOUTUBE_MAX_REQUESTS } from './youtube-data-api';

describe('fetchYouTubeChannelStats', () => {
  it('stops paging at the request cap even when the API keeps returning the same token', async () => {
    let calls = 0;
    const fake = (async (input: RequestInfo | URL) => {
      calls += 1;
      const url = new URL(String(input));
      if (url.pathname.endsWith('/channels')) {
        return Response.json({ items: [{ statistics: { subscriberCount: '10' } }] });
      }
      if (url.pathname.endsWith('/playlistItems')) return Response.json({ nextPageToken: 'SAME', items: [] });
      return Response.json({ items: [] });
    }) as typeof fetch;

    const stats = await fetchYouTubeChannelStats({ apiKey: 'test-key', channelId: 'UC0000000000000000000000' }, fake);

    expect(stats).toEqual({ subscribers: 10, videos: [] });
    expect(calls).toBeLessThanOrEqual(YOUTUBE_MAX_REQUESTS);
  });
});
