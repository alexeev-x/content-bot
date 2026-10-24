import { type ReactNode, useMemo } from 'react';
import styles from './RichText.module.css';

type Props = {
  html: string;
  /** The post's pictures, shown where the media slot is, as Telegram places them (under the heading). */
  media?: ReactNode;
};

// A rich post (owner, 23.10.2026: every post in the approved sample) shown in the studio as Telegram renders it. The HTML
// is the server's own, but it carries model and source text, so it is never inserted as markup: it is parsed and only
// the tags of the approved samples become elements; anything else keeps just its text. The post's pictures go into the
// media slot (owner, 24.10.2026: the preview put them above the heading); other media blocks are left out here.

const INLINE = new Set(['b', 'strong', 'i', 'em', 'u', 's', 'code']);
const SLOT = '{{media}}';

function children(node: Node, key: string, media: ReactNode): ReactNode[] {
  return Array.from(node.childNodes).map((child, index) => render(child, `${key}.${index}`, media));
}

function render(node: Node, key: string, media: ReactNode): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? '';
    if (!text.includes(SLOT)) return text;
    return (
      <span key={key} className={styles.media}>
        {media}
      </span>
    );
  }
  if (!(node instanceof Element)) return null;
  const tag = node.tagName.toLowerCase();
  const inner = children(node, key, media);
  if (INLINE.has(tag)) {
    const Inline = tag === 'strong' ? 'b' : tag === 'em' ? 'i' : (tag as 'b' | 'i' | 'u' | 's' | 'code');
    return <Inline key={key}>{inner}</Inline>;
  }
  switch (tag) {
    case 'h3':
      return (
        <p key={key} className={styles.heading}>
          {inner}
        </p>
      );
    case 'h4':
      return (
        <p key={key} className={styles.subheading}>
          {inner}
        </p>
      );
    case 'p':
      return <p key={key}>{inner}</p>;
    case 'br':
      return <br key={key} />;
    case 'ul':
      return <ul key={key}>{inner}</ul>;
    case 'ol':
      return <ol key={key}>{inner}</ol>;
    case 'li':
      return <li key={key}>{inner}</li>;
    case 'table':
      return (
        <table key={key} className={styles.table}>
          <tbody>{inner}</tbody>
        </table>
      );
    case 'tr':
      return <tr key={key}>{inner}</tr>;
    case 'th':
      return (
        <th key={key} colSpan={Number(node.getAttribute('colspan') ?? '1') || 1}>
          {inner}
        </th>
      );
    case 'td':
      return (
        <td key={key} colSpan={Number(node.getAttribute('colspan') ?? '1') || 1}>
          {inner}
        </td>
      );
    case 'caption':
      return null;
    case 'details':
      return (
        <details key={key} className={styles.details}>
          {inner}
        </details>
      );
    case 'summary':
      return <summary key={key}>{inner}</summary>;
    case 'tg-button-row':
      return (
        <div key={key} className={styles.buttons}>
          {inner}
        </div>
      );
    case 'tg-button': {
      const url = node.getAttribute('url') ?? '';
      return url.startsWith('https://') ? (
        <a key={key} className={styles.button} href={url} target="_blank" rel="noreferrer noopener">
          {inner}
        </a>
      ) : null;
    }
    case 'figure':
    case 'img':
    case 'video':
    case 'tg-slideshow':
    case 'tg-collage':
      return null;
    default:
      return inner;
  }
}

/** The rich HTML as Telegram shows it, built only from the approved samples' tags. */
export function RichText({ html, media = null }: Props) {
  const nodes = useMemo(() => {
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    return children(doc.body, 'r', media);
  }, [html, media]);
  return <div className={styles.rich}>{nodes}</div>;
}
