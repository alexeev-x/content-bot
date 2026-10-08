import { useId, type CSSProperties, type ElementType, type ReactNode } from 'react';
import styles from './Panel.module.css';

type Props = {
  /** Without a title the panel is only the bordered surface (wraps a table or a list). */
  title?: string;
  /** Heading level of the title; the dashboard uses h2 under the page h1. */
  headingLevel?: 2 | 3 | 4;
  icon?: ReactNode;
  /** A small badge after the title (e.g. «Превью»). */
  marker?: ReactNode;
  /** Muted text beside the title. */
  note?: string;
  /** Link or small button at the right of the header. */
  action?: ReactNode;
  /** Rows the body reserves, so the panel keeps its height from skeleton to data. */
  reserveRows?: number;
  /** Quiet header: no tint and no rule under it, for dense dashboards. */
  quiet?: boolean;
  /** One quiet line under the rows: count, «Показать ещё», stale note. Always render it so the height does not change on load. */
  footer?: ReactNode;
  children: ReactNode;
};

/** The quiet bordered surface of the admin: optional header strip plus a flush body. Rows inside split by 1px rules. */
export function Panel({
  title,
  headingLevel = 2,
  icon,
  marker,
  note,
  action,
  reserveRows,
  quiet,
  footer,
  children
}: Props) {
  const headingId = useId();
  const Heading = `h${headingLevel}` as ElementType;
  const body = reserveRows ? ({ '--reserve-rows': reserveRows } as CSSProperties) : undefined;
  return (
    <section className={styles.panel} data-quiet={quiet || undefined} aria-labelledby={title ? headingId : undefined}>
      {title ? (
        <div className={styles.head}>
          <div className={styles.heading}>
            {icon}
            <Heading id={headingId} className={styles.title}>
              {title}
            </Heading>
            {marker}
            {note ? <span className={styles.note}>{note}</span> : null}
          </div>
          {action ? <div className={styles.action}>{action}</div> : null}
        </div>
      ) : null}
      <div className={styles.body} style={body}>
        {children}
      </div>
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </section>
  );
}

/** A rule-separated list for a Panel body: items sit flush with the panel edges. */
export function PanelList({ children, 'aria-label': label }: { children: ReactNode; 'aria-label'?: string }) {
  return (
    <ul className={styles.list} aria-label={label}>
      {children}
    </ul>
  );
}

export function PanelRow({ children }: { children: ReactNode }) {
  return <li className={styles.row}>{children}</li>;
}
