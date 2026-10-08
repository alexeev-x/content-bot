import { useState } from 'react';
import { checkWord, isSwitchedOff } from '../../features/system-health';
import { formatClock } from '../../shared/lib/clock';
import { ru } from '../../shared/lib/ru';
import type { StatusCheck } from '../../shared/lib/status-check';
import { isInsideTelegram } from '../../shared/telegram/web-app';
import { Button, Drawer, Popover, Skeleton, StatusChip, useMediaQuery, VisuallyHidden } from '../../shared/ui';
import styles from './SystemStatusChip.module.css';
import { useShellStatus } from './use-shell-status';

const copy = {
  allOk: 'Всё работает',
  checked: 'Проверено в',
  refresh: 'обновляется каждую минуту'
} as const;

function Details({ checks, checkedAt }: { checks: readonly StatusCheck[]; checkedAt: string | undefined }) {
  return (
    <>
      <ul className={styles.list}>
        {checks.map((check) => {
          const problem = check.tone === 'warning' || check.tone === 'danger';
          return (
            <li key={check.id} className={styles.item}>
              <div className={styles.check}>
                <span className={styles.dot} data-tone={isSwitchedOff(check) ? 'off' : check.tone} aria-hidden="true" />
                <span className={styles.name}>{check.name}</span>
                <strong className={styles.word}>{checkWord(check)}</strong>
                {problem && check.action && !check.details ? (
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
              {problem && check.details ? <div className={styles.more}>{check.details}</div> : null}
            </li>
          );
        })}
      </ul>
      {/* One check time for the whole list: three near-identical times are noise. */}
      {checkedAt ? (
        <p className={styles.checked}>
          {copy.checked} <time dateTime={checkedAt}>{formatClock(checkedAt)}</time> · {copy.refresh}
        </p>
      ) : null}
    </>
  );
}

/** The system status chip of the top bar: one state at a glance; three lines, one check time and the fix on demand. */
export function SystemStatusChip() {
  const { checks, checkedAt } = useShellStatus();
  const wide = useMediaQuery('(min-width: 768px)');
  // Telegram's own chrome and phones use the bottom sheet; a popover would hang off the screen edge there.
  const sheet = !wide || isInsideTelegram();
  const [open, setOpen] = useState(false);

  // A re-check (opening the details of a failed bot status refetches it) must not swap the rows for a skeleton: the
  // details would unmount, remount and refetch in a loop, and the popover would close under the owner's hands.
  // While any check re-runs the last settled answer stays on screen.
  const rechecking = checks.some((check) => check.tone === 'loading');
  const key = checks.map((check) => `${check.id}:${check.tone}:${check.summary}`).join('|');
  const [settled, setSettled] = useState<{ key: string; checks: StatusCheck[] } | undefined>(undefined);
  if (!rechecking && settled?.key !== key) setSettled({ key, checks });
  const shown = rechecking ? settled?.checks : checks;

  if (!shown) {
    return (
      <div className={styles.root} aria-busy="true">
        <Skeleton height={28} width={128} radius="var(--radius-pill)" />
        <VisuallyHidden>{ru.systemStatus.loading}</VisuallyHidden>
      </div>
    );
  }

  const problems = shown.filter((check) => check.tone === 'warning' || check.tone === 'danger');
  const only = problems.length === 1 ? problems[0] : undefined;
  const tone = problems.some((check) => check.tone === 'danger') ? 'danger' : problems.length > 0 ? 'warning' : 'ok';
  const label = only
    ? (only.headline ?? only.summary)
    : problems.length > 1
      ? ru.systemStatus.attention(problems.length)
      : copy.allOk;
  const chipProps = { tone, label, 'aria-label': `${ru.systemStatus.title}: ${label}` } as const;
  const details = <Details checks={shown} checkedAt={checkedAt} />;

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
