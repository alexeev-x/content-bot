import { PanelList, PanelRow } from '../../../shared/ui';
import type { ServiceRow } from '../model/service-rows';
import { copy } from './copy';
import styles from './Dashboard.module.css';
import { EmptyLine, Section, SkeletonRows } from './DashboardPanel';

const SERVICE_ROWS = 3;

const dotTone = (tone: ServiceRow['tone']) =>
  tone === 'ok' ? 'ok' : tone === 'loading' ? 'muted' : tone === 'danger' ? 'bad' : 'warn';

/** One line per service: name, status dot and one word. No latency: there is no source for it. */
export function SystemPanel({ services }: { services: readonly ServiceRow[] | undefined }) {
  return (
    <Section area="system" title={copy.system.title} rows={SERVICE_ROWS} busy={services === undefined}>
      {services === undefined ? (
        <SkeletonRows count={SERVICE_ROWS} tile={false} />
      ) : services.length === 0 ? (
        <EmptyLine text={copy.system.empty} />
      ) : (
        <PanelList aria-label={copy.system.title}>
          {services.map((service) => (
            <PanelRow key={service.id}>
              <span className={styles.sysName} {...(service.title ? { title: service.title } : {})}>
                {service.name}
              </span>
              <span className={styles.sysState} data-tone={service.off ? 'off' : dotTone(service.tone)}>
                <span className={styles.dot} aria-hidden="true" />
                {service.word}
              </span>
            </PanelRow>
          ))}
        </PanelList>
      )}
    </Section>
  );
}
