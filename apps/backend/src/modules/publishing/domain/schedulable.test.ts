import { describe, expect, it } from 'vitest';
import { checkSchedulable, type ScheduleRefusal } from './schedulable';

const approved = { status: 'approved', revision: 3, archived: false, mediaPendingUntil: null } as const;
const archived = { status: 'approved', revision: 3, archived: true, mediaPendingUntil: null } as const;
const draft = { status: 'draft', revision: 3, archived: false, mediaPendingUntil: null } as const;
const enabled = { enabled: true };
const disabled = { enabled: false };

describe('checkSchedulable', () => {
  it.each<[string, Parameters<typeof checkSchedulable>, ScheduleRefusal | null]>([
    ['an approved post, the current revision, an enabled destination', [approved, enabled, 3, 1000], null],
    ['a missing post', [null, enabled, 3, 1000], 'POST_NOT_FOUND'],
    ['a missing destination', [approved, null, 3, 1000], 'DESTINATION_NOT_FOUND'],
    ['a missing post and destination: the post comes first', [null, null, 3, 1000], 'POST_NOT_FOUND'],
    ['a draft', [draft, enabled, 3, 1000], 'POST_NOT_APPROVED'],
    ['a draft with an old revision is still a draft', [draft, enabled, 1, 1000], 'POST_NOT_APPROVED'],
    ['an archived post', [archived, enabled, 3, 1000], 'POST_ARCHIVED'],
    ['an archived post at another revision is still archived first', [archived, enabled, 2, 1000], 'POST_ARCHIVED'],
    ['another revision of an approved post', [approved, enabled, 2, 1000], 'STALE_REVISION'],
    ['a disabled destination', [approved, disabled, 3, 1000], 'DESTINATION_DISABLED'],
    ['a stale revision wins over a disabled destination', [approved, disabled, 2, 1000], 'STALE_REVISION'],
    ['pictures still being attached', [{ ...approved, mediaPendingUntil: 2000 }, enabled, 3, 1000], 'MEDIA_PENDING'],
    ['pictures whose time ran out', [{ ...approved, mediaPendingUntil: 1000 }, enabled, 3, 1000], null]
  ])('%s', (_name, args, expected) => {
    expect(checkSchedulable(...args)).toBe(expected);
  });
});
