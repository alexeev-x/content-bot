import { describe, expect, it, vi } from 'vitest';
import type { RubricSample } from '../../modules/rubrics';
import { AppError } from '../../shared/app-error';
import { postFromSample } from './build-post';
import type { BuildAi, BuildDeps } from './types';

// The scheduler builds strict: a post worse than the owner approved must fail, never go out quietly.

const draft = (extra: Partial<RubricSample> = {}): RubricSample => ({
  picture: null,
  text: 'Черновик: 42 матча',
  noPicture: true,
  poll: null,
  ...extra
});

const ai = (caption: BuildAi['caption']): BuildAi => ({
  caption,
  scene: () => Promise.reject(new Error('no scene')),
  heroScene: () => Promise.reject(new Error('no scene')),
  fortuneScene: () => Promise.reject(new Error('no scene'))
});

const deps = (writer: BuildAi | null): BuildDeps => ({
  gameFinds: async () => [],
  stratzAccess: null,
  heroMatches: null,
  tellers: null,
  shameHeroes: null,
  turns: null,
  renderer: null,
  ai: writer,
  improvePhoto: async (file) => file,
  pace: async () => undefined,
  log: () => undefined,
  random: () => 0,
  now: Date.UTC(2026, 9, 31)
});

const failedCaption = ai(async () => ({ ok: false, code: 'NUMBER_LOST' }));

describe('buildRubricPost', () => {
  it('lets the lab see a template text as a note', async () => {
    const sample = draft();
    const post = await postFromSample(deps(failedCaption), 'confess', sample, { strict: false });
    expect(post.text).toBe('Черновик: 42 матча');
    expect(post.notes).toEqual([{ code: 'TEXT_TEMPLATE', text: 'Текст — шаблон: ИИ его не написал.' }]);
    expect(post.degradations).toEqual(['TEXT_TEMPLATE']);
  });

  it('fails a strict build whose caption the AI did not write', async () => {
    const sample = draft();
    const build = postFromSample(deps(failedCaption), 'confess', sample, { strict: true });
    await expect(build).rejects.toBeInstanceOf(AppError);
    await expect(build).rejects.toMatchObject({ details: { reason: 'DEGRADED:TEXT_TEMPLATE' } });
  });

  it('keeps a strict build with a degradation its rubric allows, and the AI text', async () => {
    const sample = draft({ notes: [{ code: 'GUIDE_BLOCK_MISSING', text: 'Нет данных: таланты' }] });
    const writer = ai(async () => ({ ok: true, text: 'Пост ИИ: 42 матча' }));
    const post = await postFromSample(deps(writer), 'hero_guide', sample, { strict: true });
    expect(post.text).toBe('Пост ИИ: 42 матча');
    expect(post.degradations).toEqual(['GUIDE_BLOCK_MISSING']);
  });

  it('fails a strict build with a degradation its rubric does not allow', async () => {
    const sample = draft({ notes: [{ code: 'GUIDE_BLOCK_MISSING', text: 'Нет данных: таланты' }] });
    const writer = ai(async () => ({ ok: true, text: 'Пост ИИ: 42 матча' }));
    await expect(postFromSample(deps(writer), 'confess', sample, { strict: true })).rejects.toMatchObject({
      details: { reason: 'DEGRADED:GUIDE_BLOCK_MISSING' }
    });
  });

  it('writes no caption and adds no note for a fixed text', async () => {
    const sample = draft({ ownText: true });
    const caption = vi.fn(async () => ({ ok: false as const, code: 'NUMBER_LOST' as const }));
    const post = await postFromSample(deps(ai(caption)), 'confess', sample, { strict: true });
    expect(caption).not.toHaveBeenCalled();
    expect(post.notes).toEqual([]);
  });
});
