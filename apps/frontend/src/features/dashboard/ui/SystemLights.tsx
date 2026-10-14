import { Button, Skeleton } from '../../../shared/ui';
import type { StatusGroup } from '../../../shared/ui';
import type { ServiceRow } from '../model/service-rows';
import { toneStyle } from '../model/tone';
import { copy } from './copy';
import shell from './Dashboard.module.css';
import styles from './SystemLights.module.css';
import { Widget } from './Widget';

const PLACEHOLDERS = ['bot', 'webhook', 'cron', 'channels'] as const;

function lightGroup(service: ServiceRow): StatusGroup {
  if (service.off || service.tone === 'loading') return 'muted';
  return service.tone === 'ok' ? 'done' : service.tone === 'danger' ? 'failed' : 'unknown';
}

/** One status light per service. A problem light glows and says what to do about it, with the one action that does it. */
export function SystemLights({ services }: { services: readonly ServiceRow[] | undefined }) {
  return (
    <Widget id="system" title={copy.system.title} busy={services === undefined}>
      <div className={shell.body}>
        {services === undefined ? (
          <ul className={styles.lights} aria-hidden="true">
            {PLACEHOLDERS.map((key) => (
              <li key={key} className={styles.light}>
                <Skeleton width={14} height={14} radius="var(--radius-pill)" />
                <Skeleton width="60%" height={14} />
              </li>
            ))}
          </ul>
        ) : services.length === 0 ? (
          <p className={shell.quiet}>{copy.system.empty}</p>
        ) : (
          <ul className={styles.lights} aria-label={copy.system.lights}>
            {services.map((service) => {
              const group = lightGroup(service);
              const problem = !service.off && (service.tone === 'warning' || service.tone === 'danger');
              return (
                <li
                  key={service.id}
                  className={styles.light}
                  style={toneStyle(group)}
                  data-problem={problem || undefined}
                >
                  <span
                    className={styles.lamp}
                    data-pulse={service.tone === 'loading' || undefined}
                    aria-hidden="true"
                  />
                  <span className={styles.text}>
                    <span className={styles.name}>{service.name}</span>
                    <span className={styles.word}>{service.word}</span>
                    {problem && service.title ? <span className={styles.hint}>{service.title}</span> : null}
                  </span>
                  {problem && service.action ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      isLoading={service.action.isLoading ?? false}
                      onPress={service.action.onPress}
                    >
                      {service.action.label}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Widget>
  );
}
