import { describe, expect, it } from 'vitest';
import { checkSchedulable, type ScheduleRefusal } from './schedulable';

const approved = { status: 'approved', revision: 3, archived: false } as const;
const archived = { status: 'approved', revision: 3, archived: true } as const;
const draft = { status: 'draft', revision: 3, archived: false } as const;
const enabled = { enabled: true };
const disabled = { enabled: false };

describe('checkSchedulable', () => {
  it.each<[string, Parameters<typeof checkSchedulable>, ScheduleRefusal | null]>([
    ['an approved post, the current revision, an enabled destination', [approved, enabled, 3], null],
    ['a missing post', [null, enabled, 3], 'POST_NOT_FOUND'],
    ['a missing destination', [approved, null, 3], 'DESTINATION_NOT_FOUND'],
    ['a missing post and destination: the post comes first', [null, null, 3], 'POST_NOT_FOUND'],
    ['a draft', [draft, enabled, 3], 'POST_NOT_APPROVED'],
    ['a draft with an old revision is still a draft', [draft, enabled, 1], 'POST_NOT_APPROVED'],
    ['an archived post', [archived, enabled, 3], 'POST_ARCHIVED'],
    ['an archived post at another revision is still archived first', [archived, enabled, 2], 'POST_ARCHIVED'],
    ['another revision of an approved post', [approved, enabled, 2], 'STALE_REVISION'],
    ['a disabled destination', [approved, disabled, 3], 'DESTINATION_DISABLED'],
    ['a stale revision wins over a disabled destination', [approved, disabled, 2], 'STALE_REVISION']
  ])('%s', (_name, args, expected) => {
    expect(checkSchedulable(...args)).toBe(expected);
  });
});
