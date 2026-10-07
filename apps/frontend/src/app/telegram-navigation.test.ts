import { describe, expect, it } from 'vitest';
import { isTabRoot, parentPath } from './telegram-navigation';

describe('telegram navigation', () => {
  it('treats the navigation destinations as roots', () => {
    for (const path of ['/', '/posts', '/publications', '/calendar', '/settings', '/posts/']) {
      expect(isTabRoot(path)).toBe(true);
    }
  });
  it('treats nested routes as not roots', () => {
    for (const path of ['/posts/new', '/posts/abc', '/settings/channels', '/settings/appearance', '/nope']) {
      expect(isTabRoot(path)).toBe(false);
    }
  });
  it('finds the parent route', () => {
    expect(parentPath('/posts/new')).toBe('/posts');
    expect(parentPath('/settings/channels/')).toBe('/settings');
    expect(parentPath('/nope')).toBe('/');
  });
});
