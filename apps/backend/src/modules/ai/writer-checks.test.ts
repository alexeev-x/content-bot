import { describe, expect, it } from 'vitest';
import { checkDraft, describeCheck } from './writer-checks';

// Stage 1 code checks: a finding is shown to the owner, never a silent rewrite, so a false hit only costs a glance and
// a miss lets a dead joke or a vague invitation go out.
describe('stage 1 code checks', () => {
  it('flags a joke explained after the punchline, not a joke left alone', () => {
    expect(checkDraft('fidit', 'direct', 'Ставь варды в фонтан. Шутка в том, что их там никто не сломает.')).toContain(
      'JOKE_EXPLAINED'
    );
    expect(checkDraft('fidit', 'direct', 'Ставь варды в фонтан: там их точно никто не сломает.')).not.toContain(
      'JOKE_EXPLAINED'
    );
  });

  it('flags a channel invitation with no time, day or link', () => {
    expect(checkDraft('telegram', 'direct', 'Залетайте на стрим, будет весело))')).toContain('INVITE_NO_DETAILS');
    for (const text of [
      'Стрим сегодня, залетайте))',
      'Стрим в 20:00, залетайте',
      'Залетайте на стрим: https://twitch.tv/alexeev',
      'Розыгрыш у @alexeev_dota, заходи'
    ])
      expect(checkDraft('telegram', 'direct', text)).not.toContain('INVITE_NO_DETAILS');
  });

  it('checks invitations only in Telegram posts', () => {
    expect(checkDraft('igrat', 'direct', 'Заходи на стрим, будем фидить. А ты подпишись уже, заебал')).not.toContain(
      'INVITE_NO_DETAILS'
    );
  });

  it('describes both codes in the owner words', () => {
    expect(describeCheck('JOKE_EXPLAINED')).toBe('шутку объясняют после панчлайна');
    expect(describeCheck('INVITE_NO_DETAILS')).toBe('приглашение без времени или ссылки');
  });
});
