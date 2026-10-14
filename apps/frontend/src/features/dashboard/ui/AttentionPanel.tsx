import { Link } from '@tanstack/react-router';
import { Button, Icon, PanelList, PanelRow, RowCard } from '../../../shared/ui';
import type { AttentionRow } from '../model/attention-rows';
import { copy } from './copy';
import styles from './Dashboard.module.css';
import { EmptyLine, PanelLink, RowTile, Section, SkeletonRows, TimeCell } from './DashboardPanel';

type Props = {
  /** Undefined while the dashboard loads: the panel shows skeleton rows in the same geometry. */
  rows: readonly AttentionRow[] | undefined;
  /** Open incidents and stuck sends from the server plus failing checks; capped at 99. */
  total: number;
  /** A system check has not answered yet: the panel says so instead of «Всё под контролем». */
  checking: boolean;
  narrow: boolean;
  /** Rows that fit the widget (the grid height); without it the phone and desktop defaults apply. */
  capacity?: number;
  now: Date;
  onOpenPublication: (publicationId: string) => void;
};

type View = {
  key: string;
  kind: 'failed' | 'unknown';
  tag: string;
  title: string;
  reason: string;
  at: string | undefined;
  publicationId: string | undefined;
  action: { label: string; aria: string; primary: boolean; onPress: () => void; isLoading: boolean } | undefined;
};

function toView(row: AttentionRow, open: (id: string) => void): View {
  if (row.type === 'check') {
    const { check } = row;
    return {
      key: row.key,
      kind: check.tone === 'danger' ? 'failed' : 'unknown',
      tag: copy.attention.systemTag,
      title: check.headline ?? `${check.name}: ${check.summary}`,
      reason: check.headline ? check.summary : '',
      at: undefined,
      publicationId: undefined,
      action: check.action
        ? {
            label: check.action.label,
            aria: check.action.label,
            primary: true,
            onPress: check.action.onPress,
            isLoading: check.action.isLoading ?? false
          }
        : undefined
    };
  }
  const id = row.publicationId;
  const unknown = row.type === 'publication' && row.kind === 'unknown';
  const stuck = row.type === 'stuck';
  const label = unknown ? copy.attention.check : copy.attention.open;
  return {
    key: row.key,
    kind: unknown || stuck ? 'unknown' : 'failed',
    tag: unknown ? copy.attention.unknownTag : stuck ? copy.attention.stuckTag : copy.attention.failedTag,
    title: row.title,
    reason: unknown ? copy.attention.unknownReason : stuck ? copy.attention.stuckReason : copy.attention.failedReason,
    at: row.at,
    publicationId: id,
    action: id
      ? {
          label,
          aria: unknown ? copy.attention.checkLabel(row.title) : copy.attention.openLabel(row.title),
          primary: unknown,
          onPress: () => open(id),
          isLoading: false
        }
      : undefined
  };
}

function ActionButton({ view }: { view: NonNullable<View['action']> }) {
  return (
    <Button
      size="sm"
      variant={view.primary ? 'primary' : 'secondary'}
      aria-label={view.aria}
      isLoading={view.isLoading}
      onPress={view.onPress}
    >
      {view.label}
    </Button>
  );
}

function DesktopRow({ view, now }: { view: View; now: Date }) {
  const unknown = view.kind === 'unknown';
  const title = view.publicationId ? (
    <Link to="/publications" search={{ id: view.publicationId }} className={styles.rowMain} title={view.title}>
      {view.title}
    </Link>
  ) : (
    <span className={styles.rowText} title={view.title}>
      {view.title}
    </span>
  );
  return (
    <PanelRow>
      <span className={styles.sev} data-kind={view.kind}>
        <Icon name={unknown ? 'alert' : 'x-circle'} size={20} />
      </span>
      <div className={styles.titleBlock}>
        {title}
        <span className={styles.excerpt}>
          <strong className={styles.kindLabel} data-kind={view.kind}>
            {view.tag}
          </strong>
          {view.reason ? ` · ${view.reason}` : ''}
        </span>
      </div>
      {view.at ? <TimeCell iso={view.at} now={now} withDay /> : null}
      {view.action ? (
        <span className={styles.actions}>
          <ActionButton view={view.action} />
        </span>
      ) : null}
    </PanelRow>
  );
}

function PhoneRow({ view, onOpen }: { view: View; onOpen: (id: string) => void }) {
  const id = view.publicationId;
  return (
    <RowCard
      title={view.title}
      media={<RowTile size={44} />}
      meta={view.reason ? `${view.tag} · ${view.reason}` : view.tag}
      {...(id ? { onPress: () => onOpen(id) } : {})}
      menu={
        view.action ? (
          <span className={styles.phoneMenu}>
            <ActionButton view={view.action} />
          </span>
        ) : undefined
      }
    />
  );
}

/** Unknown and failed publications, failing checks and stuck sends in severity order; one line when nothing needs a human. */
export function AttentionPanel({ rows, total, checking, narrow, capacity, now, onOpenPublication }: Props) {
  const reserve = capacity ?? (narrow ? 2 : 3);
  const views = rows?.slice(0, reserve).map((row) => toView(row, onOpenPublication));
  return (
    <Section
      area="attention"
      title={copy.attention.title}
      {...(rows ? { count: total >= 99 ? '99+' : String(total) } : {})}
      action={<PanelLink search={{ view: 'errors' }} text={copy.attention.all} />}
      rows={reserve}
      busy={rows === undefined}
    >
      {views === undefined ? (
        <SkeletonRows count={reserve} />
      ) : views.length === 0 ? (
        <EmptyLine
          icon={checking ? 'clock' : 'check-circle'}
          text={checking ? copy.attention.checking : copy.attention.clear}
        />
      ) : (
        <PanelList aria-label={copy.attention.title}>
          {views.map((view) =>
            narrow ? (
              <PhoneRow key={view.key} view={view} onOpen={onOpenPublication} />
            ) : (
              <DesktopRow key={view.key} view={view} now={now} />
            )
          )}
        </PanelList>
      )}
    </Section>
  );
}
