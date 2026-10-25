import { BACKGROUND_JOBS, type BackgroundJob } from '@alexeev/contracts';
import { ru } from '../../../shared/lib/ru';
import { Icon, Panel, Switch } from '../../../shared/ui';
import type { SettingsPatch } from '../model/use-general-settings';
import styles from './GeneralSettingsEditor.module.css';

type Props = {
  enabled: boolean;
  jobs: Record<BackgroundJob, boolean>;
  change: (patch: SettingsPatch) => void;
};

/**
 * DEV only (owner, 25.10.2026: «на дев убрать кроны, чтобы не тратилось»): the master switch and one switch per
 * background job; the Cron reads them where BACKGROUND_SWITCH is on. Production has no such panel.
 */
export function BackgroundJobsPanel({ enabled, jobs, change }: Props) {
  const [masterLabel, masterHint] = ru.background.master;
  return (
    <Panel title={ru.background.title} icon={<Icon name="zap" />} note={ru.background.note}>
      <ul className={styles.switches}>
        <li className={styles.plain}>
          <Switch
            variant="row"
            isSelected={enabled}
            onChange={(value) => change({ backgroundEnabled: value })}
            description={masterHint}
          >
            {masterLabel}
          </Switch>
        </li>
        {BACKGROUND_JOBS.map((job) => {
          const [label, description] = ru.background.jobs[job];
          return (
            <li key={job} className={styles.plain}>
              <Switch
                variant="row"
                isSelected={jobs[job]}
                isDisabled={!enabled}
                onChange={(value) => change({ backgroundJobs: { [job]: value } })}
                description={description}
              >
                {label}
              </Switch>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
