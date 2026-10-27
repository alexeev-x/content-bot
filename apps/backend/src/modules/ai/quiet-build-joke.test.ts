import { describe, expect, it } from 'vitest';
import { cleanJoke } from './quiet-build-joke';

// The last gate before a quiet build's joke goes to the channel on its own: the critic's empty answer must mean
// «no joke», and an address must never reach the post.
describe('quiet build joke gate', () => {
  it('turns an empty or blank verdict into no joke', () => {
    expect(cleanJoke('')).toBeNull();
    expect(cleanJoke('   ')).toBeNull();
  });

  it('drops a joke with an address or out of length', () => {
    expect(cleanJoke('Подробнее тут: https://example.com, смейся')).toBeNull();
    expect(cleanJoke('Ха')).toBeNull();
    expect(cleanJoke('а'.repeat(201))).toBeNull();
  });

  it('keeps a fitting joke, trimmed', () => {
    expect(cleanJoke('  Версия +1, а твой MMR всё ещё −25.  ')).toBe('Версия +1, а твой MMR всё ещё −25.');
  });
});
