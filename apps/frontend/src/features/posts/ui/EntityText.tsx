import { Fragment, type ReactNode } from 'react';
import type { PostEntity } from '@alexeev/contracts';
import { buildEntityTree, swallowBlockBreaks, type EntityNode } from '../model/entity-tree';
import { normalizeLinkUrl } from '../model/link-url';
import { postsCopy } from './copy';
import { Spoiler } from './Spoiler';
import styles from './EntityText.module.css';

type Props = { text: string; entities: readonly PostEntity[] };

/** Renders Telegram text with its entities as React elements, never as HTML strings. */
export function EntityText({ text, entities }: Props) {
  return <>{render(swallowBlockBreaks(buildEntityTree(text, entities)), 'n')}</>;
}

function render(nodes: EntityNode[], keyPrefix: string): ReactNode[] {
  // Keys come from the content, not the array index: an entity by its type and range (unique once normalized),
  // a text run by how much sibling text comes before it.
  let textStart = 0;
  return nodes.map((node) => {
    if (node.kind === 'text') {
      const key = `${keyPrefix}.t${textStart}`;
      textStart += node.text.length;
      return <Fragment key={key}>{node.text}</Fragment>;
    }
    const { entity } = node;
    const key = `${keyPrefix}.${entity.type}${entity.offset}+${entity.length}`;
    const children = render(node.children, key);
    switch (entity.type) {
      case 'bold':
        return <strong key={key}>{children}</strong>;
      case 'italic':
        return <em key={key}>{children}</em>;
      case 'underline':
        return <u key={key}>{children}</u>;
      case 'strikethrough':
        return <s key={key}>{children}</s>;
      case 'spoiler':
        return <Spoiler key={key}>{children}</Spoiler>;
      case 'code':
        return (
          <code key={key} className={styles.code}>
            {children}
          </code>
        );
      case 'pre':
        return (
          <pre key={key} className={styles.pre} data-language={entity.language}>
            <code>{entity.language === 'diff' ? diffLines(plainText(node.children), key) : children}</code>
          </pre>
        );
      case 'blockquote':
        return (
          <blockquote key={key} className={styles.quote}>
            {children}
          </blockquote>
        );
      case 'text_link': {
        const href = normalizeLinkUrl(entity.url);
        return href === null ? (
          <Fragment key={key}>{children}</Fragment>
        ) : (
          <a
            key={key}
            className={styles.link}
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            title={postsCopy.editor.preview.linkTitle(href)}
          >
            {children}
          </a>
        );
      }
    }
  });
}

/** The text of a subtree, without its formatting. */
function plainText(nodes: EntityNode[]): string {
  return nodes.map((node) => (node.kind === 'text' ? node.text : plainText(node.children))).join('');
}

/** A `diff` block as Telegram shows it: removed lines red, added lines green (owner, 24.10.2026). */
function diffLines(text: string, keyPrefix: string): ReactNode[] {
  let start = 0;
  return text.split('\n').map((line, index, lines) => {
    const key = `${keyPrefix}.l${start}`;
    start += line.length + 1;
    const sign = line.startsWith('+') ? 'added' : line.startsWith('-') ? 'removed' : undefined;
    return (
      <span key={key} className={styles.diffLine} data-sign={sign}>
        {line}
        {index < lines.length - 1 ? '\n' : null}
      </span>
    );
  });
}
