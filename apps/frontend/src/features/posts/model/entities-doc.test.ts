import { normalizeEntities, validatePostEntities, type PostEntity } from '@alexeev/contracts';
import { describe, expect, it } from 'vitest';
import { docToValue, valueToDoc, type DocMark, type DocNode, type RichValue } from './entities-doc';

const text = (value: string, ...marks: DocMark[]): DocNode => ({
  type: 'text',
  text: value,
  ...(marks.length > 0 ? { marks } : {})
});
const p = (...content: DocNode[]): DocNode => ({ type: 'paragraph', ...(content.length > 0 ? { content } : {}) });
const doc = (...content: DocNode[]): DocNode => ({ type: 'doc', content });
const code = (value: string, language?: string): DocNode => ({
  type: 'codeBlock',
  attrs: { language: language ?? null },
  ...(value === '' ? {} : { content: [text(value)] })
});
const quote = (...content: DocNode[]): DocNode => ({ type: 'blockquote', content });

/** The value that comes back after a document is rebuilt from its own output: the mapper's fixed point. */
function roundTrip(value: RichValue): RichValue {
  const { issue, ...mapped } = docToValue(valueToDoc(value));
  expect(issue).toBeNull();
  return mapped;
}

describe('docToValue', () => {
  it('maps an empty document and an empty paragraph to an empty body', () => {
    expect(docToValue(doc())).toEqual({ body: '', entities: [], issue: null });
    expect(docToValue(doc(p()))).toEqual({ body: '', entities: [], issue: null });
  });

  it.each([
    ['bold', 'bold'],
    ['italic', 'italic'],
    ['underline', 'underline'],
    ['strike', 'strikethrough'],
    ['spoiler', 'spoiler'],
    ['code', 'code']
  ] as const)('maps the %s mark to a %s entity', (mark, type) => {
    expect(docToValue(doc(p(text('ab ', { type: mark }), text('cd'))))).toEqual({
      body: 'ab cd',
      entities: [{ type, offset: 0, length: 3 }],
      issue: null
    });
  });

  it('maps a link to text_link and normalizes its address', () => {
    const mapped = docToValue(doc(p(text('сайт', { type: 'link', attrs: { href: 'HTTPS://Example.com' } }))));
    expect(mapped.entities).toEqual([{ type: 'text_link', offset: 0, length: 4, url: 'https://example.com/' }]);
  });

  it('drops a link whose address is not http(s) or tg, keeping the text', () => {
    const mapped = docToValue(
      doc(
        p(text('x', { type: 'link', attrs: { href: 'javascript:alert(1)' } }), text('y', { type: 'link', attrs: {} }))
      )
    );
    expect(mapped).toEqual({ body: 'xy', entities: [], issue: null });
  });

  it('joins paragraphs with one newline and keeps empty paragraphs as blank lines', () => {
    expect(docToValue(doc(p(text('a')), p(), p(text('b')))).body).toBe('a\n\nb');
  });

  it('writes a code block as pre with its language and newlines inside the text', () => {
    const mapped = docToValue(doc(p(text('до')), code('let a = 1;\nlet b = 2;', 'ts'), p(text('после'))));
    expect(mapped.body).toBe('до\nlet a = 1;\nlet b = 2;\nпосле');
    expect(mapped.entities).toEqual([{ type: 'pre', offset: 3, length: 21, language: 'ts' }]);
  });

  it('omits the language of a code block that has none, and ignores an empty block', () => {
    expect(docToValue(doc(code('x'))).entities).toEqual([{ type: 'pre', offset: 0, length: 1 }]);
    expect(docToValue(doc(p(text('a')), code(''))).entities).toEqual([]);
  });

  it('writes a quote over all its paragraphs without the separator before or after it', () => {
    const mapped = docToValue(doc(p(text('до')), quote(p(text('one')), p(text('two'))), p(text('после'))));
    expect(mapped.body).toBe('до\none\ntwo\nпосле');
    expect(mapped.entities).toEqual([{ type: 'blockquote', offset: 3, length: 7 }]);
  });

  it('counts emoji and surrogate pairs in UTF-16 units', () => {
    const mapped = docToValue(doc(p(text('😀a'), text('👍🏽 ok', { type: 'bold' }), text('🙂', { type: 'italic' }))));
    expect(mapped.body).toBe('😀a👍🏽 ok🙂');
    expect(mapped.entities).toEqual([
      { type: 'bold', offset: 3, length: '👍🏽 ok'.length },
      { type: 'italic', offset: 3 + '👍🏽 ok'.length, length: 2 }
    ]);
    expect(validatePostEntities(mapped.body, mapped.entities)).toBeNull();
  });

  it('merges neighbouring runs that carry the same mark into one entity', () => {
    const bold: DocMark = { type: 'bold' };
    const link: DocMark = { type: 'link', attrs: { href: 'https://a.example/' } };
    const mapped = docToValue(doc(p(text('a', bold), text('b', bold, link), text('c', link), text('d'))));
    expect(mapped.entities).toEqual([
      { type: 'bold', offset: 0, length: 2 },
      { type: 'text_link', offset: 1, length: 2, url: 'https://a.example/' }
    ]);
  });

  it('does not merge links with different addresses', () => {
    const mapped = docToValue(
      doc(
        p(
          text('a', { type: 'link', attrs: { href: 'https://a.example/' } }),
          text('b', { type: 'link', attrs: { href: 'https://b.example/' } })
        )
      )
    );
    expect(mapped.entities).toHaveLength(2);
  });

  it('keeps nested styles in the order the contract sorts them', () => {
    const mapped = docToValue(doc(p(text('ab', { type: 'italic' }, { type: 'bold' }), text('c', { type: 'bold' }))));
    expect(mapped.entities).toEqual([
      { type: 'bold', offset: 0, length: 3 },
      { type: 'italic', offset: 0, length: 2 }
    ]);
    expect(mapped.issue).toBeNull();
  });

  it('splits styles that start and end at different places into valid nested pieces', () => {
    const mapped = docToValue(
      doc(
        p(
          text('ab', { type: 'bold' }),
          text('cd', { type: 'bold' }, { type: 'italic' }),
          text('ef', { type: 'italic' })
        )
      )
    );
    expect(mapped.issue).toBeNull();
    expect(mapped.entities).toEqual([
      { type: 'bold', offset: 0, length: 4 },
      { type: 'italic', offset: 2, length: 2 },
      { type: 'italic', offset: 4, length: 2 }
    ]);
  });

  it('is already in the normal form', () => {
    const mapped = docToValue(doc(p(text('a', { type: 'bold' }), text('b', { type: 'italic' }, { type: 'bold' }))));
    expect(mapped.entities).toEqual(normalizeEntities(mapped.entities));
  });
});

describe('split styles round trip', () => {
  const marksPerCharacter = (node: DocNode) =>
    (node.content?.[0]?.content ?? []).flatMap((run) =>
      [...(run.text ?? '')].map(() =>
        (run.marks ?? [])
          .map((mark) => mark.type)
          .sort()
          .join('+')
      )
    );

  it('keeps the marks of every character through doc to entities to doc', () => {
    const original = doc(
      p(
        text('ab', { type: 'bold' }),
        text('cd', { type: 'bold' }, { type: 'italic' }),
        text('e', { type: 'italic' }, { type: 'underline' }),
        text('f', { type: 'underline' })
      )
    );
    const mapped = docToValue(original);
    expect(mapped.issue).toBeNull();
    const back = valueToDoc(mapped);
    expect(marksPerCharacter(back)).toEqual(marksPerCharacter(original));
    expect(docToValue(back)).toEqual(mapped);
  });
});

describe('valueToDoc', () => {
  it('builds one empty paragraph for an empty body', () => {
    expect(valueToDoc({ body: '', entities: [] })).toEqual(doc(p()));
  });

  it('splits lines into paragraphs and puts marks on the text of each', () => {
    expect(valueToDoc({ body: 'ab\n\ncd', entities: [{ type: 'bold', offset: 1, length: 5 }] })).toEqual(
      doc(p(text('a'), text('b', { type: 'bold' })), p(), p(text('cd', { type: 'bold' })))
    );
  });

  it('gives a code span no other style', () => {
    const entities: PostEntity[] = [
      { type: 'italic', offset: 0, length: 2 },
      { type: 'code', offset: 0, length: 2 }
    ];
    expect(valueToDoc({ body: 'ab', entities })).toEqual(doc(p(text('ab', { type: 'code' }))));
  });

  it('widens a quote that starts mid-line to whole lines and keeps two quotes apart', () => {
    const entities: PostEntity[] = [
      { type: 'blockquote', offset: 1, length: 2 },
      { type: 'blockquote', offset: 4, length: 1 }
    ];
    expect(valueToDoc({ body: 'ab\ncd', entities })).toEqual(doc(quote(p(text('ab'))), quote(p(text('cd')))));
  });
});

describe('round trip', () => {
  const cases: Array<[string, RichValue]> = [
    ['plain text', { body: 'Привет, мир', entities: [] }],
    ['trailing newline', { body: 'a\n', entities: [] }],
    ['blank lines', { body: '\n\na\n\n', entities: [] }],
    ['bold', { body: 'a bold b', entities: [{ type: 'bold', offset: 2, length: 4 }] }],
    ['italic', { body: 'a italic', entities: [{ type: 'italic', offset: 2, length: 6 }] }],
    ['underline', { body: 'underlined', entities: [{ type: 'underline', offset: 0, length: 10 }] }],
    ['strikethrough', { body: 'old', entities: [{ type: 'strikethrough', offset: 0, length: 3 }] }],
    ['spoiler', { body: 'a secret', entities: [{ type: 'spoiler', offset: 2, length: 6 }] }],
    ['inline code', { body: 'run npm i now', entities: [{ type: 'code', offset: 4, length: 5 }] }],
    [
      'link',
      { body: 'see site', entities: [{ type: 'text_link', offset: 4, length: 4, url: 'https://example.com/a?b=1' }] }
    ],
    ['tg link', { body: 'bot', entities: [{ type: 'text_link', offset: 0, length: 3, url: 'tg://resolve?domain=x' }] }],
    [
      'code block with language',
      { body: 'x\nlet a;\ny', entities: [{ type: 'pre', offset: 2, length: 6, language: 'js' }] }
    ],
    ['multi-line code block with a blank line', { body: 'a\n\nb', entities: [{ type: 'pre', offset: 0, length: 4 }] }],
    ['quote of two lines', { body: 'x\nq1\nq2\ny', entities: [{ type: 'blockquote', offset: 2, length: 5 }] }],
    [
      'two quotes one line apart',
      {
        body: 'a\nb\nc',
        entities: [
          { type: 'blockquote', offset: 0, length: 1 },
          { type: 'blockquote', offset: 4, length: 1 }
        ]
      }
    ],
    [
      'nested styles',
      {
        body: 'abc',
        entities: [
          { type: 'bold', offset: 0, length: 3 },
          { type: 'italic', offset: 0, length: 2 },
          { type: 'underline', offset: 1, length: 1 },
          { type: 'spoiler', offset: 1, length: 1 }
        ]
      }
    ],
    [
      'styles inside a quote and a link inside bold',
      {
        body: 'q bold link',
        entities: [
          { type: 'blockquote', offset: 0, length: 11 },
          { type: 'bold', offset: 2, length: 9 },
          { type: 'text_link', offset: 7, length: 4, url: 'https://example.com/' }
        ]
      }
    ],
    [
      'code block inside a quote',
      {
        body: 'q\ncode\nq2',
        entities: [
          { type: 'blockquote', offset: 0, length: 9 },
          { type: 'pre', offset: 2, length: 4 }
        ]
      }
    ],
    [
      'emoji and surrogate pairs',
      {
        body: '😀 привет 👍🏽 мир\n🎉',
        entities: [
          { type: 'bold', offset: 3, length: 6 },
          { type: 'italic', offset: 10, length: 4 },
          { type: 'spoiler', offset: 19, length: 2 }
        ]
      }
    ]
  ];

  it.each(cases)('keeps %s', (_name, value) => {
    const normal = { body: value.body, entities: normalizeEntities(value.entities) };
    expect(validatePostEntities(normal.body, normal.entities)).toBeNull();
    expect(roundTrip(normal)).toEqual(normal);
  });

  it('is stable when applied twice', () => {
    const once = roundTrip(cases[16]?.[1] as RichValue);
    expect(roundTrip(once)).toEqual(once);
  });
});
