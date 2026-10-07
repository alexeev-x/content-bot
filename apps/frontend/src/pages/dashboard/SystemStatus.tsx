import { useState, type ReactNode } from 'react';
import { useBotCheck } from '../../features/bot';
import { useServiceChecks } from '../../features/system-health';
import { ru } from '../../shared/lib/ru';
import type { CheckTone, StatusCheck } from '../../shared/lib/status-check';
import { isInsideTelegram } from '../../shared/telegram/web-app';
import { Button, Drawer, Icon, Popover, Skeleton, useMediaQuery, VisuallyHidden } from '../../shared/ui';
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

/** One strip instead of cards: a quiet line when healthy, one row with the action on a problem, details on demand. */
export function SystemStatus() {
  const service = useServiceChecks();
  const bot = useBotCheck();
  const checks = [...service.checks, bot];
  const wide = useMediaQuery('(min-width: 768px)');
  // Telegram's own chrome and phones use the bottom sheet; a popover would hang off the screen edge there.
  const sheet = !wide || isInsideTelegram();
  const [sheetOpen, setSheetOpen] = useState(false);

  const problems = checks.filter((check) => check.tone === 'warning' || check.tone === 'danger');
  const loading = checks.some((check) => check.tone === 'loading');
  const tone: CheckTone = problems.some((check) => check.tone === 'danger')
    ? 'danger'
    : problems.length > 0
      ? 'warning'
      : 'ok';
  const only = problems.length === 1 ? problems[0] : undefined;
  const details = <Details checks={checks} />;

  // The element that opens the details: a popover trigger on desktop, a sheet opener on phones.
  const opener = (content: ReactNode, className: string | undefined) => {
    const button = (
      <Button
        variant="ghost"
        size="sm"
        {...(className ? { className } : {})}
        {...(sheet
          ? { 'aria-haspopup': 'dialog' as const, 'aria-expanded': sheetOpen, onPress: () => setSheetOpen(true) }
          : {})}
      >
        {content}
      </Button>
    );
    return sheet ? (
      button
    ) : (
      <Popover trigger={button} label={ru.systemStatus.title} placement="bottom start">
        <div className={styles.popover}>{details}</div>
      </Popover>
    );
  };

  let body: ReactNode;
  let announcement = '';
  if (problems.length === 0 && loading) {
    body = (
      <div className={styles.strip} data-tone="loading" aria-busy="true">
        <Skeleton height={20} width={160} />
        <VisuallyHidden>{ru.systemStatus.loading}</VisuallyHidden>
      </div>
    );
  } else if (problems.length === 0) {
    announcement = ru.systemStatus.allOk;
    const checkedAt = service.checkedAt ? timeFormatter.format(new Date(service.checkedAt)) : undefined;
    body = (
      <div className={styles.strip} data-tone="ok">
        {opener(
          <>
            <span className={styles.dot} data-tone="ok" aria-hidden="true" />
            <span className={styles.text}>{ru.systemStatus.allOk}</span>
          </>,
          styles.line
        )}
        {wide && checkedAt ? <span className={styles.checked}>{ru.systemStatus.checkedAt(checkedAt)}</span> : null}
      </div>
    );
  } else if (only) {
    const headline = only.headline ?? only.summary;
    announcement = headline;
    body = (
      <div className={styles.strip} data-tone={tone}>
        {opener(
          <>
            <Icon name="alert" size={18} className={styles.icon} />
            <span className={styles.text}>{headline}</span>
          </>,
          styles.line
        )}
        {only.action ? (
          <Button size="sm" isLoading={only.action.isLoading ?? false} onPress={only.action.onPress}>
            {only.action.label}
          </Button>
        ) : null}
      </div>
    );
  } else {
    const headline = ru.systemStatus.attention(problems.length);
    announcement = headline;
    body = (
      <div className={styles.strip} data-tone={tone}>
        <Icon name="alert" size={18} className={styles.icon} />
        <span className={styles.text}>{headline}</span>
        {opener(ru.systemStatus.sort, styles.sort)}
      </div>
    );
  }

  return (
    <section aria-label={ru.systemStatus.title}>
      {body}
      <VisuallyHidden>
        <output>{announcement}</output>
      </VisuallyHidden>
      {sheet ? (
        <Drawer variant="bottom" title={ru.systemStatus.title} isOpen={sheetOpen} onOpenChange={setSheetOpen}>
          {details}
        </Drawer>
      ) : null}
    </section>
  );
}
