import { Link } from '@tanstack/react-router';
import { formatDayClock } from '../../../shared/lib/clock';
import { Button, Icon, StatusBadge } from '../../../shared/ui';
import type { AttentionRow } from '../model/attention-rows';
import { Block } from './Block';
import { copy } from './copy';
import styles from './Dashboard.module.css';
import { Row } from './Row';

type Props = {
  rows: readonly AttentionRow[];
  onOpenPublication: (publicationId: string) => void;
};

function Tag({ label }: { label: string }) {
  return (
    <span className={styles.tag}>
      <Icon name="alert" size={15} />
      {label}
    </span>
  );
}

function RowView({ row, onOpenPublication }: { row: AttentionRow; onOpenPublication: Props['onOpenPublication'] }) {
  if (row.type === 'check') {
    const { check } = row;
    return (
      <Row
        layout="inline"
        badge={<Tag label={copy.attention.systemTag} />}
        title={`${check.name}: ${check.summary}`}
        trail={
          check.action ? (
            <Button size="sm" isLoading={check.action.isLoading ?? false} onPress={check.action.onPress}>
              {check.action.label}
            </Button>
          ) : null
        }
      />
    );
  }
  const id = row.publicationId;
  const time = formatDayClock(row.at);
  if (row.type === 'stuck') {
    return (
      <Row
        layout="inline"
        time={time}
        badge={<Tag label={copy.attention.stuckTag} />}
        title={row.title}
        channel={row.channel}
        hint={copy.attention.stuckHint}
        trail={
          id ? (
            <OpenButton
              label={copy.attention.open}
              aria={copy.attention.openLabel(row.title)}
              onPress={() => onOpenPublication(id)}
            />
          ) : null
        }
      />
    );
  }
  const unknown = row.kind === 'unknown';
  return (
    <Row
      layout="inline"
      time={time}
      badge={<StatusBadge status={row.kind} />}
      title={row.title}
      channel={row.channel}
      {...(unknown ? { hint: copy.attention.unknownHint } : {})}
      trail={
        id ? (
          <OpenButton
            label={unknown ? copy.attention.check : copy.attention.open}
            aria={unknown ? copy.attention.checkLabel(row.title) : copy.attention.openLabel(row.title)}
            onPress={() => onOpenPublication(id)}
          />
        ) : null
      }
    />
  );
}

function OpenButton({ label, aria, onPress }: { label: string; aria: string; onPress: () => void }) {
  return (
    <Button size="sm" variant="secondary" aria-label={aria} onPress={onPress}>
      {label}
    </Button>
  );
}

/** Unknown and failed publications, failing checks and stuck sends in severity order; one line when nothing needs a human. */
export function AttentionBlock({ rows, onOpenPublication }: Props) {
  if (rows.length === 0) return <p className={styles.clear}>{copy.attention.clear}</p>;
  return (
    <Block title={copy.attention.title}>
      <ul className={styles.list}>
        {rows.map((row) => (
          <RowView key={row.key} row={row} onOpenPublication={onOpenPublication} />
        ))}
      </ul>
      <Link to="/incidents" className={styles.more}>
        {copy.attention.allIncidents}
      </Link>
    </Block>
  );
}
