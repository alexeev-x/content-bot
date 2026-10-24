import type { PostEntity } from '@alexeev/contracts';

const SEPARATOR = '\n\n';

/**
 * The text and entities the dispatcher sends: the trimmed title in bold, a blank line, the trimmed body with its
 * entities cut to what is left of the body and moved after the title. The preview and the server must agree on this.
 */
export function previewMessage(
  title: string,
  body: string,
  entities: readonly PostEntity[]
): { text: string; entities: PostEntity[] } {
  const head = title.trim();
  const rest = body.trim();
  const text = [head, rest].filter((part) => part !== '').join(SEPARATOR);
  const result: PostEntity[] = head === '' ? [] : [{ type: 'bold', offset: 0, length: head.length }];
  if (rest !== '') {
    const start = body.length - body.trimStart().length;
    const end = start + rest.length;
    const shift = head === '' ? 0 : head.length + SEPARATOR.length;
    for (const entity of entities) {
      const from = Math.max(entity.offset, start);
      const to = Math.min(entity.offset + entity.length, end);
      if (to > from) result.push({ ...entity, offset: from - start + shift, length: to - from });
    }
  }
  return { text, entities: result };
}
