import { afterEach, describe, expect, it } from 'vitest';
import { clearOwnerName, readOwnerName, writeOwnerName } from './owner-name-cache';

describe('owner name cache', () => {
  afterEach(() => window.localStorage.clear());

  it('remembers the confirmed name and forgets it on clear', () => {
    expect(readOwnerName()).toBeUndefined();
    writeOwnerName('  Алексей ');
    expect(readOwnerName()).toBe('Алексей');
    clearOwnerName();
    expect(readOwnerName()).toBeUndefined();
  });

  it('ignores empty and oversized values', () => {
    writeOwnerName('   ');
    expect(readOwnerName()).toBeUndefined();
    window.localStorage.setItem('ui-owner-name', 'x'.repeat(65));
    expect(readOwnerName()).toBeUndefined();
  });
});
