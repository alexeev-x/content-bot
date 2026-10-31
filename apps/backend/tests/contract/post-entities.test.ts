import {
  createPostInputSchema,
  normalizeEntities,
  POST_ENTITIES_JSON_MAX,
  type PostEntity,
  postEntitySchema,
  postSchema,
  updatePostInputSchema,
  validatePostEntities
} from '@alexeev/contracts';
import { describe, expect, it } from 'vitest';

const bold = (offset: number, length: number): PostEntity => ({ type: 'bold', offset, length });
const entity = (type: PostEntity['type'], offset: number, length: number): PostEntity =>
  type === 'text_link'
    ? { type, offset, length, url: 'https://example.com/' }
    : ({ type, offset, length } as PostEntity);

describe('postEntitySchema', () => {
  it.each([
    { type: 'bold', offset: 0, length: 1 },
    { type: 'italic', offset: 0, length: 1 },
    { type: 'underline', offset: 0, length: 1 },
    { type: 'strikethrough', offset: 0, length: 1 },
    { type: 'spoiler', offset: 0, length: 1 },
    { type: 'code', offset: 0, length: 1 },
    { type: 'blockquote', offset: 0, length: 1 },
    { type: 'pre', offset: 0, length: 1 },
    { type: 'pre', offset: 0, length: 1, language: 'c++' },
    { type: 'text_link', offset: 4, length: 2, url: 'https://example.com/a?b=c#d' },
    { type: 'text_link', offset: 0, length: 1, url: 'http://example.com' },
    { type: 'text_link', offset: 0, length: 1, url: 'tg://resolve?domain=durov' }
  ])('accepts %j', (value) => {
    expect(postEntitySchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ['an unsupported type', { type: 'mention', offset: 0, length: 1 }],
    ['custom_emoji', { type: 'custom_emoji', offset: 0, length: 1 }],
    ['expandable_blockquote', { type: 'expandable_blockquote', offset: 0, length: 1 }],
    ['a zero length', { type: 'bold', offset: 0, length: 0 }],
    ['a negative offset', { type: 'bold', offset: -1, length: 1 }],
    ['a fractional offset', { type: 'bold', offset: 0.5, length: 1 }],
    ['an unknown key', { type: 'bold', offset: 0, length: 1, color: 'red' }],
    ['a language on a bold', { type: 'bold', offset: 0, length: 1, language: 'ts' }],
    ['a link without a url', { type: 'text_link', offset: 0, length: 1 }],
    ['a url on a bold', { type: 'bold', offset: 0, length: 1, url: 'https://example.com/' }],
    ['a language with a space', { type: 'pre', offset: 0, length: 1, language: 'type script' }],
    ['a language over 64 characters', { type: 'pre', offset: 0, length: 1, language: 'a'.repeat(65) }],
    ['a javascript: link', { type: 'text_link', offset: 0, length: 1, url: 'javascript:alert(1)' }],
    ['an ftp link', { type: 'text_link', offset: 0, length: 1, url: 'ftp://example.com/' }],
    ['a scheme without slashes', { type: 'text_link', offset: 0, length: 1, url: 'tg:resolve?domain=x' }],
    ['a link without a host', { type: 'text_link', offset: 0, length: 1, url: 'tg://' }],
    ['a link with a space', { type: 'text_link', offset: 0, length: 1, url: 'https://example.com/a b' }],
    ['a link with a backslash', { type: 'text_link', offset: 0, length: 1, url: 'https://example.com/a\\b' }],
    ['a link with a non-ASCII host', { type: 'text_link', offset: 0, length: 1, url: 'https://пример.рф/' }]
  ])('rejects %s', (_name, value) => {
    expect(postEntitySchema.safeParse(value).success).toBe(false);
  });

  it('allows a link of exactly 2048 characters and refuses 2049', () => {
    const url = (length: number) => `https://e.co/${'a'.repeat(length - 'https://e.co/'.length)}`;

    expect(postEntitySchema.safeParse({ type: 'text_link', offset: 0, length: 1, url: url(2048) }).success).toBe(true);
    expect(postEntitySchema.safeParse({ type: 'text_link', offset: 0, length: 1, url: url(2049) }).success).toBe(false);
  });
});

describe('validatePostEntities', () => {
  const body = 'hello world, hello!';

  it('accepts none, ranges inside the body and ranges that fill it', () => {
    expect(validatePostEntities(body, [])).toBeNull();
    expect(validatePostEntities(body, [bold(0, body.length)])).toBeNull();
    expect(validatePostEntities(body, [bold(6, 5), entity('italic', 13, 5)])).toBeNull();
  });

  it('refuses a range past the end and names the entity', () => {
    expect(validatePostEntities(body, [bold(0, 1), bold(15, 5)])).toEqual({ code: 'ENTITIES_OUT_OF_RANGE', index: 1 });
  });

  it('counts UTF-16 units: an emoji is two, so a range one unit too long is out of range', () => {
    expect(validatePostEntities('😀😀', [bold(0, 4)])).toBeNull();
    expect(validatePostEntities('😀😀', [bold(0, 5)])).toEqual({ code: 'ENTITIES_OUT_OF_RANGE', index: 0 });
    expect(validatePostEntities('😀😀', [bold(2, 3)])).toEqual({ code: 'ENTITIES_OUT_OF_RANGE', index: 0 });
  });

  it('refuses a boundary inside a surrogate pair, at the start and at the end', () => {
    expect(validatePostEntities('a😀b', [bold(1, 2)])).toBeNull();
    expect(validatePostEntities('a😀b', [bold(2, 2)])).toEqual({ code: 'ENTITIES_SPLIT_SURROGATE', index: 0 });
    expect(validatePostEntities('a😀b', [bold(0, 2)])).toEqual({ code: 'ENTITIES_SPLIT_SURROGATE', index: 0 });
    expect(validatePostEntities('a😀b', [bold(0, 1), bold(3, 1)])).toBeNull();
  });

  it('refuses more than 100 entities', () => {
    const many = Array.from({ length: 101 }, (_, i) => bold(i * 2, 1));
    const text = 'x'.repeat(250);

    expect(validatePostEntities(text, many.slice(0, 100))).toBeNull();
    expect(validatePostEntities(text, many)).toEqual({ code: 'ENTITIES_TOO_MANY' });
  });

  it('refuses a list whose stored form is over the size cap', () => {
    const links = Array.from({ length: 9 }, (_, i): PostEntity => ({
      type: 'text_link',
      offset: i * 2,
      length: 1,
      url: `https://e.co/${'a'.repeat(1900)}`
    }));
    expect(JSON.stringify(links).length).toBeGreaterThan(POST_ENTITIES_JSON_MAX);

    expect(validatePostEntities('x'.repeat(30), links)).toEqual({ code: 'ENTITIES_TOO_LARGE' });
    expect(validatePostEntities('x'.repeat(30), links.slice(0, 8))).toBeNull();
  });

  describe('nesting', () => {
    const text = 'abcdefghij';

    it('accepts disjoint, touching and fully nested entities, whatever the order of the list', () => {
      expect(validatePostEntities(text, [bold(0, 3), entity('italic', 3, 3)])).toBeNull();
      expect(validatePostEntities(text, [entity('italic', 2, 2), bold(0, 6)])).toBeNull();
      expect(validatePostEntities(text, [entity('underline', 0, 4), entity('italic', 1, 2), bold(0, 10)])).toBeNull();
    });

    it('accepts two entities on exactly the same range when one may contain the other', () => {
      expect(validatePostEntities(text, [bold(0, 4), entity('italic', 0, 4)])).toBeNull();
      expect(validatePostEntities(text, [entity('code', 0, 4), bold(0, 4)])).toBeNull();
      expect(validatePostEntities(text, [entity('blockquote', 0, 4), entity('code', 0, 4)])).toBeNull();
    });

    it('refuses entities that overlap without one containing the other', () => {
      expect(validatePostEntities(text, [bold(0, 4), entity('italic', 2, 4)])).toEqual({
        code: 'ENTITIES_INVALID_NESTING',
        index: 1
      });
      expect(validatePostEntities(text, [entity('code', 0, 4), entity('code', 3, 3)])).not.toBeNull();
    });

    it.each(['bold', 'italic', 'underline', 'strikethrough', 'spoiler'] as const)(
      '%s may contain and sit inside every other type',
      (style) => {
        for (const other of [
          'bold',
          'italic',
          'underline',
          'strikethrough',
          'spoiler',
          'text_link',
          'blockquote'
        ] as const) {
          if (other === style) continue;
          expect(validatePostEntities(text, [entity(style, 0, 6), entity(other, 1, 3)])).toBeNull();
          expect(validatePostEntities(text, [entity(other, 0, 6), entity(style, 1, 3)])).toBeNull();
        }
        expect(validatePostEntities(text, [entity(style, 0, 6), entity('code', 1, 3)])).toBeNull();
        expect(validatePostEntities(text, [entity(style, 0, 6), entity('pre', 1, 3)])).toBeNull();
      }
    );

    it.each(['code', 'pre'] as const)('%s contains nothing and sits only inside styles and blockquote', (type) => {
      for (const inner of [
        'bold',
        'italic',
        'underline',
        'strikethrough',
        'spoiler',
        'text_link',
        'blockquote',
        'code',
        'pre'
      ] as const) {
        expect(validatePostEntities(text, [entity(type, 0, 6), entity(inner, 1, 3)])).not.toBeNull();
      }
      for (const outer of ['bold', 'italic', 'underline', 'strikethrough', 'spoiler', 'blockquote'] as const) {
        expect(validatePostEntities(text, [entity(outer, 0, 6), entity(type, 1, 3)])).toBeNull();
      }
      for (const outer of ['text_link', 'code', 'pre'] as const) {
        if (outer === type) continue;
        expect(validatePostEntities(text, [entity(outer, 0, 6), entity(type, 1, 3)])).not.toBeNull();
      }
    });

    it('never nests a blockquote in a blockquote, even on the same range', () => {
      expect(validatePostEntities(text, [entity('blockquote', 0, 6), entity('blockquote', 1, 3)])).not.toBeNull();
      expect(validatePostEntities(text, [entity('blockquote', 0, 6), entity('blockquote', 0, 6)])).not.toBeNull();
    });

    it('never nests a link in a link, and a link never holds or sits in code or pre', () => {
      const other: PostEntity = { type: 'text_link', offset: 1, length: 3, url: 'https://example.org/' };
      expect(validatePostEntities(text, [entity('text_link', 0, 6), other])).not.toBeNull();
      expect(validatePostEntities(text, [entity('text_link', 0, 6), entity('code', 1, 3)])).not.toBeNull();
      expect(validatePostEntities(text, [entity('pre', 0, 6), entity('text_link', 1, 3)])).not.toBeNull();
      expect(validatePostEntities(text, [entity('text_link', 0, 3), entity('text_link', 3, 3)])).toBeNull();
    });
  });
});

describe('normalizeEntities', () => {
  it('sorts by offset ascending, then length descending, then a fixed type order', () => {
    const result = normalizeEntities([
      entity('code', 4, 2),
      bold(4, 2),
      entity('italic', 0, 2),
      entity('underline', 0, 6),
      entity('blockquote', 4, 2)
    ]);

    expect(result).toEqual([
      entity('underline', 0, 6),
      entity('italic', 0, 2),
      entity('blockquote', 4, 2),
      bold(4, 2),
      entity('code', 4, 2)
    ]);
  });

  it('merges adjacent and overlapping entities of the same type and attributes', () => {
    expect(normalizeEntities([bold(0, 3), bold(3, 2), bold(10, 1), bold(4, 4)])).toEqual([bold(0, 8), bold(10, 1)]);
    expect(normalizeEntities([bold(0, 10), bold(2, 3)])).toEqual([bold(0, 10)]);
  });

  it('keeps entities apart when type or attributes differ', () => {
    const a: PostEntity = { type: 'text_link', offset: 0, length: 3, url: 'https://a.example/' };
    const b: PostEntity = { type: 'text_link', offset: 3, length: 3, url: 'https://b.example/' };
    const ts: PostEntity = { type: 'pre', offset: 0, length: 3, language: 'ts' };
    const py: PostEntity = { type: 'pre', offset: 3, length: 3, language: 'py' };

    expect(normalizeEntities([b, a])).toEqual([a, b]);
    expect(normalizeEntities([py, ts])).toEqual([ts, py]);
    expect(normalizeEntities([bold(0, 3), entity('italic', 3, 3)])).toHaveLength(2);
  });

  it('merges links with the same address into one', () => {
    const first: PostEntity = { type: 'text_link', offset: 0, length: 3, url: 'https://a.example/' };
    const second: PostEntity = { ...first, offset: 3 };

    expect(normalizeEntities([second, first])).toEqual([{ ...first, length: 6 }]);
  });

  it('is idempotent and does not change its input', () => {
    const input = [bold(3, 2), bold(0, 3), entity('italic', 1, 1)];
    const copy = structuredClone(input);

    const once = normalizeEntities(input);

    expect(input).toEqual(copy);
    expect(normalizeEntities(once)).toEqual(once);
  });
});

describe('normalizeEntities splits partially overlapping free styles', () => {
  const style = (type: PostEntity['type'], offset: number, length: number) => entity(type, offset, length);

  it('cuts the later style at the end of the earlier one', () => {
    const result = normalizeEntities([style('italic', 2, 4), bold(0, 4)]);

    expect(result).toEqual([bold(0, 4), style('italic', 2, 2), style('italic', 4, 2)]);
    expect(validatePostEntities('abcdef', result)).toBeNull();
  });

  it('handles three staggered styles', () => {
    const result = normalizeEntities([bold(0, 4), style('italic', 2, 4), style('underline', 4, 4)]);

    expect(result).toEqual([
      bold(0, 4),
      style('italic', 2, 2),
      style('italic', 4, 2),
      style('underline', 4, 2),
      style('underline', 6, 2)
    ]);
    expect(validatePostEntities('abcdefgh', result)).toBeNull();
  });

  it('handles a spoiler crossing bold and italic that cross each other', () => {
    const input = [bold(0, 4), style('italic', 2, 4), style('spoiler', 1, 4)];

    const result = normalizeEntities(input);

    expect(validatePostEntities('abcdef', result)).toBeNull();
    expect(coverage('abcdef', result)).toEqual(coverage('abcdef', input));
  });

  it('leaves valid nesting alone and never merges the pieces of a split back together', () => {
    const nested = [bold(0, 10), style('italic', 2, 3)];
    expect(normalizeEntities(nested)).toEqual(nested);

    const once = normalizeEntities([bold(0, 4), style('italic', 2, 4)]);
    expect(once.filter((piece) => piece.type === 'italic')).toHaveLength(2);
    expect(normalizeEntities(once)).toEqual(once);
  });

  it('does not touch overlaps with code, pre, links or blockquotes: the validator still refuses them', () => {
    for (const other of ['code', 'pre', 'text_link', 'blockquote'] as const) {
      const input = [bold(0, 4), style(other, 2, 4)];

      const result = normalizeEntities(input);

      expect(result).toHaveLength(2);
      expect(validatePostEntities('abcdef', result)).toEqual({ code: 'ENTITIES_INVALID_NESTING', index: 1 });
    }
  });

  it('leaves a list past 100 entities for the validator to refuse instead of splitting without end', () => {
    const types = ['bold', 'italic', 'underline', 'strikethrough', 'spoiler'] as const;
    const staggered = Array.from({ length: 100 }, (_, i) => style(types[i % 5] ?? 'bold', i, 3));

    const result = normalizeEntities(staggered);

    expect(validatePostEntities('x'.repeat(200), result)).not.toBeNull();
  });

  it('keeps a boundary inside an emoji visible to the validator after splitting', () => {
    const result = normalizeEntities([bold(0, 3), style('italic', 2, 4)]);

    expect(validatePostEntities('😀😀', result)?.code).toBe('ENTITIES_SPLIT_SURROGATE');
  });

  // The visible meaning of a list: for every UTF-16 unit, which styles cover it.
  function coverage(text: string, list: readonly PostEntity[]): string[] {
    return Array.from({ length: text.length }, (_, unit) =>
      [...new Set(list.filter((e) => e.offset <= unit && unit < e.offset + e.length).map((e) => e.type))]
        .sort()
        .join(',')
    );
  }

  it('is idempotent, valid and keeps every character looking the same, for random free-style lists with emoji', () => {
    let seed = 20_261_007;
    const random = (): number => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    };
    const pick = (n: number): number => Math.floor(random() * n);
    const types = ['bold', 'italic', 'underline', 'strikethrough', 'spoiler'] as const;

    for (let round = 0; round < 300; round += 1) {
      const text = Array.from({ length: 6 + pick(10) }, () => (random() < 0.3 ? '😀' : 'ab'[pick(2)])).join('');
      // Boundaries between characters only: an entity never cuts an emoji in half.
      const boundaries = [0];
      for (let unit = 1; unit <= text.length; unit += 1) {
        const splitsPair = unit < text.length && /[\uD800-\uDBFF]/.test(text[unit - 1] ?? '');
        if (!splitsPair) boundaries.push(unit);
      }
      const input = Array.from({ length: 1 + pick(7) }, (): PostEntity => {
        const from = pick(boundaries.length - 1);
        const to = from + 1 + pick(boundaries.length - 1 - from);
        const offset = boundaries[from] ?? 0;
        return style(types[pick(5)] ?? 'bold', offset, (boundaries[to] ?? offset + 1) - offset);
      });

      const once = normalizeEntities(input);

      expect(validatePostEntities(text, input.length > 0 ? once : [])).toBeNull();
      expect(normalizeEntities(once)).toEqual(once);
      expect(normalizeEntities([...input].reverse())).toEqual(once);
      expect(coverage(text, once)).toEqual(coverage(text, input));
    }
  });
});

describe('createPostInputSchema', () => {
  it('defaults entities to none', () => {
    expect(createPostInputSchema.parse({ body: 'x' })).toEqual({
      body: 'x',
      entities: [],
      kind: 'text'
    });
  });

  it('accepts partially overlapping free styles by splitting them', () => {
    const parsed = createPostInputSchema.parse({
      body: 'abcdef',
      entities: [bold(0, 4), entity('italic', 2, 4)]
    });

    expect(parsed.entities).toEqual([bold(0, 4), entity('italic', 2, 2), entity('italic', 4, 2)]);
  });

  it('returns the normal form', () => {
    const parsed = createPostInputSchema.parse({ body: 'abcdef', entities: [bold(3, 3), bold(0, 3)] });

    expect(parsed.entities).toEqual([bold(0, 6)]);
  });

  it('checks the entities against the body with UTF-16 units', () => {
    const fits = createPostInputSchema.safeParse({ body: '😀', entities: [bold(0, 2)] });
    const tooLong = createPostInputSchema.safeParse({ body: '😀', entities: [bold(0, 3)] });
    const split = createPostInputSchema.safeParse({ body: '😀😀', entities: [bold(1, 2)] });

    expect(fits.success).toBe(true);
    expect(tooLong.error?.issues[0]).toMatchObject({ message: 'ENTITIES_OUT_OF_RANGE', path: ['entities', 0] });
    expect(split.error?.issues[0]).toMatchObject({ message: 'ENTITIES_SPLIT_SURROGATE', path: ['entities', 0] });
  });

  it('refuses 101 entities before looking at the body', () => {
    const many = Array.from({ length: 101 }, (_, i) => bold(i * 2, 1));

    expect(createPostInputSchema.safeParse({ body: 'x'.repeat(250), entities: many }).success).toBe(false);
  });
});

describe('updatePostInputSchema', () => {
  it('refuses a new body without entities, so stale offsets are never kept', () => {
    const result = updatePostInputSchema.safeParse({ revision: 0, body: 'new text' });

    expect(result.error?.issues[0]).toMatchObject({ message: 'ENTITIES_REQUIRED', path: ['entities'] });
  });

  it('accepts a new body with its entities, empty for plain text, and checks them against it', () => {
    expect(updatePostInputSchema.safeParse({ revision: 0, body: 'new', entities: [] }).success).toBe(true);
    const parsed = updatePostInputSchema.parse({ revision: 0, body: 'new text', entities: [bold(4, 4), bold(0, 4)] });
    expect(parsed.entities).toEqual([bold(0, 8)]);
    expect(
      updatePostInputSchema.safeParse({ revision: 0, body: 'new', entities: [bold(0, 9)] }).error?.issues[0]
    ).toMatchObject({
      message: 'ENTITIES_OUT_OF_RANGE'
    });
  });

  it('accepts entities alone (the server checks those against the stored body)', () => {
    expect(updatePostInputSchema.parse({ revision: 0, entities: [bold(5, 5), bold(0, 5)] }).entities).toEqual([
      bold(0, 10)
    ]);
    expect(updatePostInputSchema.safeParse({ revision: 0, entities: [] }).success).toBe(true);
  });

  it('has no title field: the old title-first-line format is gone (owner, 31.10.2026)', () => {
    expect(updatePostInputSchema.safeParse({ revision: 0, title: 'T' }).success).toBe(false);
    expect(createPostInputSchema.safeParse({ title: 'T', body: 'x' }).success).toBe(false);
  });

  it('still refuses an update that changes nothing', () => {
    expect(updatePostInputSchema.safeParse({ revision: 0 }).success).toBe(false);
  });
});

describe('postSchema', () => {
  it('requires the entities list in a PostDto', () => {
    const dto = {
      id: crypto.randomUUID(),
      title: 'T',
      body: 'b',
      revision: 0,
      status: 'draft',
      archivedAt: null,
      autoDeleteAt: null,
      publicationSummary: { counts: {}, nextScheduled: null, lastSentAt: null, destinations: [] },
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString()
    };

    expect(postSchema.safeParse({ ...dto, entities: [] }).error?.issues.map((issue) => issue.path[0])).not.toContain(
      'entities'
    );
    expect(postSchema.safeParse(dto).error?.issues.map((issue) => issue.path[0])).toContain('entities');
  });
});
