import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Button, Icon, Skeleton } from '../../../shared/ui';
import shell from './Dashboard.module.css';
import styles from './Overview.module.css';
import { Widget } from './Widget';

export type SourceRow = {
  id: string;
  /** Logo or icon of the source. */
  mark: ReactNode;
  title: string;
  subtitle: string;
  /** «18 мин назад». */
  time?: string;
  attention?: boolean;
  action: { label: string; onPress: () => void; primary?: boolean };
};

type Props = {
  rows: readonly SourceRow[] | undefined;
  footer?: string;
};

/** «Новости и источники»: the latest Dota updates and the state of the analytics sources, each with its next step. */
export function SourcesWidget({ rows, footer }: Props) {
  return (
    <Widget
      id="sources"
      title="Новости и источники"
      busy={rows === undefined}
      action={
        <Link to="/sources" className={shell.more}>
          Все источники <Icon name="chevron-right" size={16} />
        </Link>
      }
    >
      <div className={styles.body}>
        {rows === undefined ? (
          <ul className={styles.sources} aria-hidden="true">
            {[0, 1, 2, 3].map((key) => (
              <li key={key} className={styles.source}>
                <span className={styles.sourceMark} />
                <span className={styles.recentText}>
                  <span className={styles.recentTitle}>
                    <Skeleton width="50%" height="1lh" />
                  </span>
                  <span className={shell.quiet}>
                    <Skeleton width="85%" height="2lh" />
                  </span>
                </span>
                <span className={styles.sourceTime}>
                  <Skeleton width={56} height="1lh" />
                </span>
                <Skeleton width={104} height="var(--size-button-sm)" radius="var(--radius-2)" />
              </li>
            ))}
          </ul>
        ) : rows.length === 0 ? (
          <p className={shell.quiet}>Новостей пока нет.</p>
        ) : (
          <ul className={styles.sources}>
            {rows.map((row) => (
              <li key={row.id} className={styles.source}>
                <span className={styles.sourceMark}>{row.mark}</span>
                <span className={styles.recentText}>
                  <span className={styles.recentTitle}>{row.title}</span>
                  <span className={shell.quiet}>{row.subtitle}</span>
                </span>
                <span className={styles.sourceTime}>
                  {row.attention ? (
                    <span className={styles.attention}>
                      <Icon name="alert" size={14} /> Требует внимания
                    </span>
                  ) : (
                    row.time
                  )}
                </span>
                <Button size="sm" variant={row.action.primary ? 'primary' : 'secondary'} onPress={row.action.onPress}>
                  {row.action.label}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {footer ? (
          <p className={styles.sourcesFooter}>{footer}</p>
        ) : rows === undefined ? (
          <p className={styles.sourcesFooter} aria-hidden="true">
            <Skeleton width="70%" height="2lh" />
          </p>
        ) : null}
      </div>
    </Widget>
  );
}
