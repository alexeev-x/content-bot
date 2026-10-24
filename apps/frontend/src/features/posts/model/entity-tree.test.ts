import type { PostEntity } from '@alexeev/contracts';
import { describe, expect, it } from 'vitest';
import { buildEntityTree, swallowBlockBreaks } from './entity-tree';
import { previewMessage } from './preview-message';

describe('previewMessage', () => {
  it('joins the trimmed title and body with a blank line and bolds the title', () => {
    expect(previewMessage('  Заголовок ', '\n текст  ', [])).toEqual({
      text: 'Заголовок\n\nтекст',
      entities: [{ type: 'bold', offset: 0, length: 9 }]
    });
  });

  it('moves body entities after the title and cuts them to the trimmed body', () => {
    const entities: PostEntity[] = [
      { type: 'italic', offset: 0, length: 4 },
      { type: 'bold', offset: 2, length: 3 },
      { type: 'code', offset: 5, length: 1 }
    ];
    // body "  ab c": the two leading spaces are trimmed away together with the part of an entity that covers them.
    expect(previewMessage('T', '  ab c', entities).entities).toEqual([
      { type: 'bold', offset: 0, length: 1 },
      { type: 'italic', offset: 3, length: 2 },
      { type: 'bold', offset: 3, length: 3 },
      { type: 'code', offset: 6, length: 1 }
    ]);
  });

  it('sends the body alone without a title', () => {
    expect(previewMessage('', 'a', [{ type: 'bold', offset: 0, length: 1 }])).toEqual({
      text: 'a',
      entities: [{ type: 'bold', offset: 0, length: 1 }]
    });
  });
});

describe('buildEntityTree', () => {
  it('returns one text node without entities', () => {
    expect(buildEntityTree('abc', [])).toEqual([{ kind: 'text', text: 'abc' }]);
  });

  it('nests styles and keeps the text around them', () => {
    const tree = buildEntityTree('a bc d', [
      { type: 'bold', offset: 2, length: 2 },
      { type: 'italic', offset: 2, length: 1 }
    ]);
    expect(tree).toEqual([
      { kind: 'text', text: 'a ' },
      {
        kind: 'entity',
        entity: { type: 'bold', offset: 2, length: 2 },
        children: [
          {
            kind: 'entity',
            entity: { type: 'italic', offset: 2, length: 1 },
            children: [{ kind: 'text', text: 'b' }]
          },
          { kind: 'text', text: 'c' }
        ]
      },
      { kind: 'text', text: ' d' }
    ]);
  });

  it('clips an out-of-range entity and a crossing one the contract refuses (code) instead of throwing', () => {
    const tree = buildEntityTree('abcd', [
      { type: 'bold', offset: 0, length: 3 },
      { type: 'code', offset: 2, length: 2 },
      { type: 'code', offset: 9, length: 2 }
    ]);
    expect(tree).toEqual([
      {
        kind: 'entity',
        entity: { type: 'bold', offset: 0, length: 3 },
        children: [
          { kind: 'text', text: 'ab' },
          {
            kind: 'entity',
            entity: { type: 'code', offset: 2, length: 2 },
            children: [{ kind: 'text', text: 'c' }]
          }
        ]
      },
      { kind: 'text', text: 'd' }
    ]);
  });
});

describe('swallowBlockBreaks', () => {
  it('removes one newline after a quote, also when it sits outside the style that ends with the quote', () => {
    const tree = swallowBlockBreaks(buildEntityTree('a\nq\n\nb', [{ type: 'blockquote', offset: 2, length: 1 }]));
    expect(tree.at(-1)).toEqual({ kind: 'text', text: '\nb' });
    expect(tree[0]).toEqual({ kind: 'text', text: 'a\n' });
  });

  it('keeps the newline after styles that are not blocks', () => {
    const tree = swallowBlockBreaks(buildEntityTree('q\nb', [{ type: 'bold', offset: 0, length: 1 }]));
    expect(tree.at(-1)).toEqual({ kind: 'text', text: '\nb' });
  });
});
