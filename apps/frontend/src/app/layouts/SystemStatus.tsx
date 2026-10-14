import { useState } from 'react';
import { checkWord, isSwitchedOff } from '../../features/system-health';
import { ru } from '../../shared/lib/ru';
import type { StatusCheck } from '../../shared/lib/status-check';
import { Button as AriaButton } from 'react-aria-components';
import { Button, Icon, Skeleton, VisuallyHidden } from '../../shared/ui';
import menu from './AccountMenu.module.css';
import styles from './SystemStatus.module.css';
import { useShellStatus } from './use-shell-status';

const copy = {
  allOk: 'Всё работает'
} as const;

function Details({ checks }: { checks: readonly StatusCheck[] }) {
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
    </>
  );
}

export type SystemStatusTone = 'ok' | 'warning' | 'danger';

/**
 * The shell's system status: the last settled checks, one tone and one line. A re-check (opening the details of a
 * failed bot status refetches it) must not swap the rows for a skeleton, or the details would unmount, remount and
 * refetch in a loop; while any check re-runs the last settled answer stays.
 */
export function useSystemStatus(): {
  checks: StatusCheck[] | undefined;
  tone: SystemStatusTone;
  label: string;
} {
  const { checks } = useShellStatus();
  const rechecking = checks.some((check) => check.tone === 'loading');
  const key = checks.map((check) => `${check.id}:${check.tone}:${check.summary}`).join('|');
  const [settled, setSettled] = useState<{ key: string; checks: StatusCheck[] } | undefined>(undefined);
  if (!rechecking && settled?.key !== key) setSettled({ key, checks });
  const shown = rechecking ? settled?.checks : checks;
  const problems = (shown ?? []).filter((check) => check.tone === 'warning' || check.tone === 'danger');
  const only = problems.length === 1 ? problems[0] : undefined;
  const tone = problems.some((check) => check.tone === 'danger') ? 'danger' : problems.length > 0 ? 'warning' : 'ok';
  const label = !shown
    ? ru.systemStatus.loading
    : only
      ? (only.headline ?? only.summary)
      : problems.length > 1
        ? ru.systemStatus.attention(problems.length)
        : copy.allOk;
  return { checks: shown, tone, label };
}

/** «Статус системы» row of the account menu: one line at a glance, the checks and their fixes on demand. */
export function SystemStatusSection({ status }: { status: ReturnType<typeof useSystemStatus> }) {
  // A problem opens the details right away: that is why the owner opened the menu.
  const [open, setOpen] = useState(status.tone !== 'ok');
  return (
    <section className={styles.section} aria-label={ru.systemStatus.title}>
      <AriaButton className={menu.row} aria-expanded={open} onPress={() => setOpen((value) => !value)}>
        <Icon name="monitor" size={18} />
        <span className={menu.rowLabel}>{ru.systemStatus.title}</span>
        <span className={styles.summary}>
          <span className={styles.dot} data-tone={status.checks ? status.tone : 'off'} aria-hidden="true" />
          <span className={styles.summaryText}>{status.label}</span>
        </span>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} />
      </AriaButton>
      {open ? status.checks ? <Details checks={status.checks} /> : <Skeleton height={72} /> : null}
      <VisuallyHidden>
        <output>{status.label}</output>
      </VisuallyHidden>
    </section>
  );
}
