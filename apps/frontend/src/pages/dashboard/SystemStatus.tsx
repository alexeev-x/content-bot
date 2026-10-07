import { useState } from 'react';
import { useBotCheck } from '../../features/bot';
import { useServiceChecks } from '../../features/system-health';
import { ru } from '../../shared/lib/ru';
import type { StatusCheck } from '../../shared/lib/status-check';
import { isInsideTelegram } from '../../shared/telegram/web-app';
import { Button, Drawer, Popover, Skeleton, StatusChip, useMediaQuery, VisuallyHidden } from '../../shared/ui';
import styles from './SystemStatus.module.css';

const timeFormatter = new Intl.DateTimeFormat('ru-RU', { timeStyle: 'short' });

function Details({ checks }: { checks: readonly StatusCheck[] }) {
  return (
    <ul className={styles.list}>
      {checks.map((check) => (
        <li key={check.id} className={styles.item}>
          <div className={styles.check}>
            <span className={styles.dot} data-tone={check.tone} aria-hidden="true" />
            <span className={styles.name}>{check.name}</span>
            <span className={styles.summary}>{check.summary}</span>
            {check.action && !check.details ? (
              <Button
                size="sm"
                variant="secondary"
                isLoading={check.action.isLoading ?? false}
                onPress={check.action.onPress}
              >
                {check.action.label}
              </Button>
            ) : null}
          </div>
          {check.details && check.tone !== 'loading' ? <div className={styles.more}>{check.details}</div> : null}
        </li>
      ))}
    </ul>
  );
}

type Props = {
  /** The failing checks are listed with their own action elsewhere on the page, so the strip keeps only its count line. */
  actionListedBelow?: boolean;
};

/** A status chip for the page header: the overall state and check time; details on demand, the single fix beside it. */
export function SystemStatus({ actionListedBelow = false }: Props) {
  const service = useServiceChecks();
  const bot = useBotCheck();
  const checks = [...service.checks, bot];
  const wide = useMediaQuery('(min-width: 768px)');
  // Telegram's own chrome and phones use the bottom sheet; a popover would hang off the screen edge there.
  const sheet = !wide || isInsideTelegram();
  const [open, setOpen] = useState(false);

  const problems = checks.filter((check) => check.tone === 'warning' || check.tone === 'danger');
  const loading = checks.some((check) => check.tone === 'loading');
  const only = problems.length === 1 ? problems[0] : undefined;
  const tone = problems.some((check) => check.tone === 'danger') ? 'danger' : problems.length > 0 ? 'warning' : 'ok';
  const time = service.checkedAt ? timeFormatter.format(new Date(service.checkedAt)) : undefined;

  const label = only
    ? (only.headline ?? only.summary)
    : problems.length > 1
      ? ru.systemStatus.attention(problems.length)
      : ru.systemStatus.allOk;

  if (problems.length === 0 && loading) {
    return (
      <div className={styles.root} aria-busy="true">
        <Skeleton height={28} width={200} radius="var(--radius-pill)" />
        <VisuallyHidden>{ru.systemStatus.loading}</VisuallyHidden>
      </div>
    );
  }

  const chipProps = {
    tone,
    label,
    ...(time ? { time } : {}),
    'aria-label': time ? `${label}, ${time}` : label
  } as const;
  const details = <Details checks={checks} />;

  return (
    <section className={styles.root} aria-label={ru.systemStatus.title}>
      {sheet ? (
        <StatusChip {...chipProps} aria-haspopup="dialog" aria-expanded={open} onPress={() => setOpen(true)} />
      ) : (
        <Popover
          trigger={<StatusChip {...chipProps} />}
          label={ru.systemStatus.title}
          placement="bottom end"
          isOpen={open}
          onOpenChange={setOpen}
        >
          <div className={styles.popover}>{details}</div>
        </Popover>
      )}
      {only?.action && !actionListedBelow ? (
        <Button size="sm" isLoading={only.action.isLoading ?? false} onPress={only.action.onPress}>
          {only.action.label}
        </Button>
      ) : null}
      <VisuallyHidden>
        <output>{label}</output>
      </VisuallyHidden>
      {sheet ? (
        <Drawer variant="bottom" title={ru.systemStatus.title} isOpen={open} onOpenChange={setOpen}>
          {details}
        </Drawer>
      ) : null}
    </section>
  );
}
