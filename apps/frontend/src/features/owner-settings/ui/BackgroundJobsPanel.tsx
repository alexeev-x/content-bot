import { BACKGROUND_JOBS, type BackgroundJob } from '@alexeev/contracts';
import { Icon, Panel, Switch } from '../../../shared/ui';
import type { SettingsPatch } from '../model/use-general-settings';
import styles from './GeneralSettingsEditor.module.css';

type Props = {
  enabled: boolean;
  jobs: Record<BackgroundJob, boolean>;
  change: (patch: SettingsPatch) => void;
};

// Copy lives here, not in ru.ts, so a production build (no «Тестирование») drops it with the panel.
const COPY: {
  title: string;
  note: string;
  master: readonly [string, string];
  jobs: Record<BackgroundJob, readonly [string, string]>;
} = {
  title: 'Фоновые задачи',
  note: 'Что Cron делает сам, пока задача включена: так DEV не тратит ресурсы Cloudflare впустую.',
  master: [
    'Фоновые задачи',
    'Главный рубильник: выключен — Cron не делает ничего, даже публикации и очистку. Включён — публикации и очистка работают, задачи ниже — по своим рубильникам.'
  ],
  jobs: {
    sources: ['Источники Dota', 'Новости, патчи, сокровищницы, ранний сигнал сборки.'],
    gameFiles: ['Файлы игры', 'Проверка изменений в файлах после новой сборки.'],
    heroMatches: ['База матчей', 'Сбор матчей высокого ранга для «Гайда на героя».'],
    rubricScheduler: ['Рубрики', 'Репетиция планировщика рубрик в тестовый канал, без ИИ.'],
    contentAnalytics: ['Сбор аналитики', 'Цифры YouTube, TikTok и канала.'],
    reports: ['Отчёты', 'Ежедневный и недельный отчёты.'],
    contentAlerts: ['Сигналы аналитики', 'Ролик выстрелил или просел.'],
    aiReviews: ['Разборы ИИ', 'Разборы новых роликов.'],
    scriptPrompts: ['Вопросы про сценарии', 'Снят ли ролик по сценарию.'],
    aiLearning: ['Уроки стиля', 'Разбор ваших правок для ИИ.']
  }
};

/**
 * DEV only (owner, 25.10.2026: «на дев убрать кроны, чтобы не тратилось»): the master switch and one switch per
 * background job; only a DEV build's Cron reads them (backend app/lab/lab-cron.ts). Production has no such panel.
 */
export function BackgroundJobsPanel({ enabled, jobs, change }: Props) {
  const [masterLabel, masterHint] = COPY.master;
  return (
    <Panel title={COPY.title} icon={<Icon name="zap" />} note={COPY.note}>
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
          const [label, description] = COPY.jobs[job];
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
