import type { IncidentDto } from '@alexeev/contracts';
import { Link } from '@tanstack/react-router';
import { Button, Skeleton } from '../../../shared/ui';
import { copy } from './copy';
import styles from './Dashboard.module.css';
import { EmptyLine, PanelLink, Section } from './DashboardPanel';

export type IncidentSummary = {
  open: number;
  /** Closed in the last 7 days among the newest closed ones; a lower bound when `closedCapped`. */
  closed: number;
  closedCapped: boolean;
  latest: IncidentDto | undefined;
};

type Props = {
  summary: IncidentSummary | undefined;
  failed?: boolean;
  onRetry?: () => void;
};

/** Open count, closed in the last 7 days and the newest incident with a link. */
export function IncidentsPanel({ summary, failed, onRetry }: Props) {
  const latest = summary?.latest;
  const publication = latest?.publication;
  return (
    <Section
      area="incidents"
      title={copy.incidents.title}
      action={<PanelLink to="/incidents" text={copy.incidents.all} />}
      rows={2}
      busy={summary === undefined && !failed}
    >
      {failed ? (
        <EmptyLine
          text={copy.widgetError}
          action={
            onRetry ? (
              <Button size="sm" variant="ghost" onPress={onRetry}>
                {copy.retry}
              </Button>
            ) : undefined
          }
        />
      ) : summary === undefined ? (
        <div className={styles.incidentBody} aria-hidden="true">
          <Skeleton width="40%" height={26} />
          <Skeleton width="70%" height={14} />
        </div>
      ) : (
        <div className={styles.incidentBody}>
          <dl className={styles.incidentFigures}>
            <div>
              <dt>{copy.incidents.open}</dt>
              <dd>{summary.open >= 99 ? '99+' : summary.open}</dd>
            </div>
            <div>
              <dt>{copy.incidents.closed}</dt>
              <dd>{summary.closedCapped ? `${summary.closed}+` : summary.closed}</dd>
            </div>
          </dl>
          {latest ? (
            publication ? (
              <Link to="/publications" search={{ id: publication.id }} className={styles.incidentLatest}>
                <span className={styles.excerpt}>{copy.incidents.latest}</span>
                <span className={styles.rowText}>{publication.postTitle}</span>
              </Link>
            ) : (
              <Link to="/incidents" className={styles.incidentLatest}>
                <span className={styles.excerpt}>{copy.incidents.latest}</span>
                <span className={styles.rowText}>{latest.code}</span>
              </Link>
            )
          ) : (
            <p className={styles.weekHint}>{copy.incidents.none}</p>
          )}
        </div>
      )}
    </Section>
  );
}
