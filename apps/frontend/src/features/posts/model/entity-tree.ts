import { normalizeEntities, type PostEntity } from '@alexeev/contracts';

export type EntityNode =
  { kind: 'text'; text: string } | { kind: 'entity'; entity: PostEntity; children: EntityNode[] };

/**
 * Text plus entities → a tree of nested spans. Tolerant on purpose: the preview shows what the operator is typing,
 * so a range that is out of bounds or crosses its parent is clipped instead of throwing.
 */
export function buildEntityTree(text: string, entities: readonly PostEntity[]): EntityNode[] {
  const sorted = normalizeEntities(entities).filter((entity) => entity.offset < text.length);
  let cursor = 0;

  function parse(start: number, end: number): EntityNode[] {
    const nodes: EntityNode[] = [];
    let position = start;
    for (;;) {
      const entity = sorted[cursor];
      if (entity === undefined || entity.offset >= end) break;
      cursor += 1;
      // Overlaps what is already rendered (a crossing range): skipped, the text itself is never lost.
      if (entity.offset < position) continue;
      if (entity.offset > position) nodes.push({ kind: 'text', text: text.slice(position, entity.offset) });
      const entityEnd = Math.min(entity.offset + entity.length, end);
      nodes.push({ kind: 'entity', entity, children: parse(entity.offset, entityEnd) });
      position = entityEnd;
    }
    if (position < end) nodes.push({ kind: 'text', text: text.slice(position, end) });
    return nodes;
  }

  return parse(0, text.length);
}

const BLOCK_TYPES = new Set<PostEntity['type']>(['pre', 'blockquote']);

/**
 * Drops the one newline that follows a quote or code block. Telegram ends the block there; rendered as a block
 * element in a browser, that newline would show as an extra empty line.
 */
export function swallowBlockBreaks(nodes: EntityNode[]): EntityNode[] {
  let afterBlock = false;
  const walk = (list: EntityNode[]): EntityNode[] =>
    list.flatMap((node): EntityNode[] => {
      if (node.kind === 'text') {
        const text = afterBlock && node.text.startsWith('\n') ? node.text.slice(1) : node.text;
        afterBlock = false;
        return text === '' ? [] : [{ kind: 'text', text }];
      }
      afterBlock = false;
      const children = walk(node.children);
      afterBlock = BLOCK_TYPES.has(node.entity.type);
      return [{ ...node, children }];
    });
  return walk(nodes);
}
