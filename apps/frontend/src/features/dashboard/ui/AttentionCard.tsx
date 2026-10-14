import { Link } from '@tanstack/react-router';
import { Button, Icon, Skeleton } from '../../../shared/ui';
import type { AttentionRow } from '../model/attention-rows';
import { toneStyle } from '../model/tone';
import { toAttentionView } from './attention-view';
import styles from './AttentionCard.module.css';
import { copy } from './copy';
import shell from './Dashboard.module.css';
import { Widget } from './Widget';

const MAX_ROWS = 3;

type Props = {
  /** Undefined while the dashboard loads. */
  rows: readonly AttentionRow[] | undefined;
  /** Server incidents and stuck sends plus failing checks; capped at 99. */
  total: number;
  /** A system check has not answered yet: the card says so instead of «Всё в порядке». */
  checking: boolean;
  phone: boolean;
  onOpenPublication: (publicationId: string) => void;
};

/** A check mark in a ring with two sparks, drawn in the status tokens. */
function Calm() {
  return (
    <svg className={styles.calm} viewBox="0 0 96 96" aria-hidden="true">
      <circle className={styles.calmDisc} cx="48" cy="48" r="34" />
      <circle className={styles.calmRing} cx="48" cy="48" r="34" />
      <path className={styles.calmCheck} d="M33 49.5 43.5 60 63.5 38" />
      <path className={styles.calmSpark} d="M80 16v10M75 21h10M16 70v8M12 74h8" />
    </svg>
  );
}

/** Failed, unknown and stuck sends and failing checks: one coloured card with a big count; calm and green when there is none. */
export function AttentionCard({ rows, total, checking, phone, onOpenPublication }: Props) {
  const views = rows?.slice(0, MAX_ROWS).map((row) => toAttentionView(row, onOpenPublication));
  const loaded = views !== undefined;
  const clear = loaded && views.length === 0;
  const group = !loaded || checking ? 'muted' : clear ? 'done' : 'failed';
  const count = total >= 99 ? '99+' : String(total);

  if (clear && phone) {
    return (
      <Widget id="attention" title={copy.attention.title} style={toneStyle(group)} bare>
        <p className={styles.compact}>
          <Icon name={checking ? 'clock' : 'check-circle'} size={20} />
          {checking ? copy.attention.checking : copy.attention.clear}
        </p>
      </Widget>
    );
  }

  return (
    <Widget
      id="attention"
      title={copy.attention.title}
      style={toneStyle(group)}
      busy={!loaded}
      action={
        clear ? undefined : (
          <Link to="/publications" search={{ view: 'errors' }}>
            {copy.attention.all}
            <Icon name="chevron-right" size={14} />
          </Link>
        )
      }
    >
      <div className={`${shell.body} ${styles.body}`}>
        {!loaded ? (
          <div aria-hidden="true" className={styles.skeleton}>
            <Skeleton width={72} height={56} />
            <Skeleton height={14} width="70%" />
            <Skeleton height={14} width="55%" />
          </div>
        ) : clear ? (
          <div className={styles.clear}>
            <Calm />
            <p className={styles.clearTitle}>{checking ? copy.attention.checking : copy.attention.clear}</p>
            {checking ? null : <p className={shell.quiet}>{copy.attention.clearDetail}</p>}
          </div>
        ) : (
          <>
            <p className={styles.bigRow}>
              <span className={styles.big}>{count}</span>
              <span className={styles.bigLabel}>{copy.attention.count(total)}</span>
            </p>
            <ul className={styles.rows}>
              {views.map((view) => (
                <li key={view.key} className={styles.row}>
                  <span className={styles.rowIcon} style={toneStyle(view.kind === 'unknown' ? 'unknown' : 'failed')}>
                    <Icon name={view.kind === 'unknown' ? 'alert' : 'x-circle'} size={18} />
                  </span>
                  <span className={styles.rowText}>
                    <span className={shell.truncate} title={view.title}>
                      {view.title}
                    </span>
                    <small>
                      <strong>{view.tag}</strong>
                      {view.reason ? ` · ${view.reason}` : ''}
                    </small>
                  </span>
                  {view.action ? (
                    <Button
                      size="sm"
                      variant={view.action.primary ? 'primary' : 'secondary'}
                      aria-label={view.action.aria}
                      isLoading={view.action.isLoading}
                      onPress={view.action.onPress}
                    >
                      {view.action.label}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Widget>
  );
}
