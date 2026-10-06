import { describe, expect, it } from 'vitest';
import { displayName } from './display-name';

describe('displayName', () => {
  it('joins first and last name', () => {
    expect(displayName({ first_name: 'Alex', last_name: 'Abby' })).toBe('Alex Abby');
  });

  it('strips control, bidi and zero-width characters and collapses whitespace', () => {
    expect(displayName({ first_name: 'Al\u0000ex\n‮', last_name: ' A​b  by ' })).toBe('Al ex A b by');
  });

  it('falls back to the username, then to a fixed name', () => {
    expect(displayName({ first_name: '​', username: 'alex' })).toBe('alex');
    expect(displayName({ first_name: '\u0007' })).toBe('Owner');
  });

  it('bounds the length by code point without splitting a surrogate pair', () => {
    const name = displayName({ first_name: '😀'.repeat(100) });
    expect([...name]).toHaveLength(64);
    expect(name).toBe('😀'.repeat(64));
  });
});
