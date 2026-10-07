import {
  normalizeEntities,
  postEntitySchema,
  validatePostEntities,
  type PostEntity,
  type PostEntityIssue
} from '@alexeev/contracts';
import { isCodeLanguage } from './code-language';
import { normalizeLinkUrl } from './link-url';

// Pure mapper between the editor document (ProseMirror JSON) and the stored form: plain `body` plus Telegram
// entities with UTF-16 offsets. No React and no editor view, so it runs and tests anywhere.
//
// Document shape (see editor-extensions.ts): doc > (paragraph | codeBlock | blockquote > (paragraph | codeBlock))+.
// Every paragraph and code block is one «line group» and the groups are joined by "\n". A paragraph is one line;
// a code block may hold several. A blockquote or code block becomes one entity over its text.

export type DocMark = { type: string; attrs?: Record<string, unknown> };
export type DocNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  marks?: DocMark[];
  text?: string;
};

export type RichValue = { body: string; entities: PostEntity[] };
/** `issue` is set when the marks cannot be written as Telegram entities (see ENTITIES_INVALID_NESTING below). */
export type MappedValue = RichValue & { issue: PostEntityIssue | null };

const INLINE_BY_MARK = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strike: 'strikethrough',
  spoiler: 'spoiler',
  code: 'code'
} as const;

const MARK_BY_ENTITY = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strikethrough: 'strike',
  spoiler: 'spoiler',
  code: 'code'
} as const;

function textOf(node: DocNode): string {
  return (node.content ?? []).map((child) => (child.type === 'text' ? (child.text ?? '') : '')).join('');
}

/** Editor document → body and entities in the contract's normal form. */
export function docToValue(doc: DocNode): MappedValue {
  let body = '';
  let started = false;
  const raw: PostEntity[] = [];

  // The "\n" between two groups is written when the next group starts, so a quote starts after it.
  const beginGroup = () => {
    if (started) body += '\n';
    started = true;
  };

  function paragraph(node: DocNode) {
    beginGroup();
    for (const child of node.content ?? []) {
      if (child.type !== 'text' || !child.text) continue;
      const offset = body.length;
      const length = child.text.length;
      body += child.text;
      for (const mark of child.marks ?? []) {
        if (mark.type === 'link') {
          const href = typeof mark.attrs?.href === 'string' ? normalizeLinkUrl(mark.attrs.href) : null;
          if (href !== null) raw.push({ type: 'text_link', offset, length, url: href });
        } else if (mark.type in INLINE_BY_MARK) {
          raw.push({ type: INLINE_BY_MARK[mark.type as keyof typeof INLINE_BY_MARK], offset, length });
        }
      }
    }
  }

  function codeBlock(node: DocNode) {
    beginGroup();
    const text = textOf(node);
    if (text === '') return;
    const language = node.attrs?.language;
    raw.push({
      type: 'pre',
      offset: body.length,
      length: text.length,
      ...(typeof language === 'string' && language !== '' && isCodeLanguage(language) ? { language } : {})
    });
    body += text;
  }

  function block(node: DocNode) {
    if (node.type === 'paragraph') paragraph(node);
    else if (node.type === 'codeBlock') codeBlock(node);
    else if (node.type === 'blockquote') {
      const offset = body.length + (started ? 1 : 0);
      for (const child of node.content ?? []) block(child);
      if (body.length > offset) raw.push({ type: 'blockquote', offset, length: body.length - offset });
    }
  }

  for (const node of doc.content ?? []) block(node);

  const valid = raw.filter((entity) => postEntitySchema.safeParse(entity).success);
  const entities = normalizeEntities(valid);
  // Marks may start and end at different places (bold over «ab», italic over «bc»); normalizeEntities splits such
  // free styles into nested pieces, so only crossings with code, pre, links or quotes are left for the validator.
  return { body, entities, issue: validatePostEntities(body, entities) };
}

type Line = { start: number; end: number };

function splitLines(body: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (;;) {
    const next = body.indexOf('\n', start);
    if (next === -1) {
      lines.push({ start, end: body.length });
      return lines;
    }
    lines.push({ start, end: next });
    start = next + 1;
  }
}

// A line is covered by a block entity when they share a character; an empty line owns its "\n".
const covers = (entity: PostEntity, line: Line) =>
  entity.offset < Math.max(line.end, line.start + 1) && entity.offset + entity.length > line.start;

function marksFor(entities: PostEntity[]): DocMark[] {
  // A code span carries no other style in the editor, so it wins; the rest of a valid list never conflicts.
  const code = entities.find((entity) => entity.type === 'code');
  if (code) return [{ type: 'code' }];
  const marks: DocMark[] = [];
  for (const entity of entities) {
    if (entity.type === 'text_link') marks.push({ type: 'link', attrs: { href: entity.url } });
    else if (entity.type in MARK_BY_ENTITY) {
      marks.push({ type: MARK_BY_ENTITY[entity.type as keyof typeof MARK_BY_ENTITY] });
    }
  }
  return marks;
}

function paragraphOf(body: string, line: Line, inline: PostEntity[]): DocNode {
  const cuts = new Set([line.start, line.end]);
  const here = inline.filter((entity) => entity.offset < line.end && entity.offset + entity.length > line.start);
  for (const entity of here) {
    cuts.add(Math.max(entity.offset, line.start));
    cuts.add(Math.min(entity.offset + entity.length, line.end));
  }
  const points = [...cuts].sort((a, b) => a - b);
  const content: DocNode[] = [];
  for (const [index, from] of points.entries()) {
    const to = points[index + 1];
    if (to === undefined || to === from) continue;
    const marks = marksFor(here.filter((entity) => entity.offset <= from && entity.offset + entity.length >= to));
    content.push({ type: 'text', text: body.slice(from, to), ...(marks.length > 0 ? { marks } : {}) });
  }
  return content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' };
}

/**
 * Body and entities → editor document. A code block or quote that starts or ends in the middle of a line is
 * widened to whole lines (the editor has no half-line blocks); styles inside a code block are dropped, as
 * Telegram does not render them.
 */
export function valueToDoc(value: RichValue): DocNode {
  const { body, entities } = value;
  const lines = splitLines(body);
  const pres = entities.filter((entity) => entity.type === 'pre');
  const quotes = entities.filter((entity) => entity.type === 'blockquote');
  const inline = entities.filter((entity) => entity.type !== 'pre' && entity.type !== 'blockquote');

  type Built = { quote: number; node: DocNode };
  const built: Built[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line === undefined) break;
    const quote = quotes.findIndex((entity) => covers(entity, line));
    const pre = pres.findIndex((entity) => covers(entity, line));
    if (pre === -1) {
      built.push({ quote, node: paragraphOf(body, line, inline) });
      index += 1;
      continue;
    }
    const texts: string[] = [];
    while (index < lines.length) {
      const current = lines[index];
      const entity = pres[pre];
      if (current === undefined || entity === undefined || !covers(entity, current)) break;
      texts.push(body.slice(current.start, current.end));
      index += 1;
    }
    const text = texts.join('\n');
    const language = (pres[pre] as Extract<PostEntity, { type: 'pre' }>).language;
    built.push({
      quote,
      node: {
        type: 'codeBlock',
        attrs: { language: language ?? null },
        ...(text === '' ? {} : { content: [{ type: 'text', text }] })
      }
    });
  }

  const content: DocNode[] = [];
  for (const [position, item] of built.entries()) {
    const last = content[content.length - 1];
    const previousQuote = built[position - 1]?.quote ?? -1;
    if (item.quote === -1) content.push(item.node);
    else if (last?.type === 'blockquote' && previousQuote === item.quote) last.content?.push(item.node);
    else content.push({ type: 'blockquote', content: [item.node] });
  }
  return { type: 'doc', content };
}
