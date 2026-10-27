import { useNavigate, useSearch } from '@tanstack/react-router';
import { useDocumentTitle } from '../../app/use-document-title';
import { LabAutopublish } from '../../features/lab-autopublish';
import { BackgroundJobsEditor, useOwnerTimezone } from '../../features/owner-settings';
import { RubricSamplesList } from '../../features/rubric-samples';
import { ru } from '../../shared/lib/ru';
import { PageHeader, Tab, TabList, TabPanel, Tabs } from '../../shared/ui';
import styles from './LabPage.module.css';

type LabTab = 'rubrics' | 'autopublish' | 'background';

/**
 * «Тестирование» (owner, 26.10.2026): every DEV-only tool in one place, one tab each, kept in the URL (`?tab=`).
 * Only a non-production build renders this page (routes/lab.tsx); the rest of the studio stays as it ships.
 */
export function LabPage() {
  useDocumentTitle(ru.nav.lab);
  const timezone = useOwnerTimezone();
  const search = useSearch({ from: '/lab' });
  const navigate = useNavigate({ from: '/lab' });
  const tab: LabTab = search.tab ?? 'rubrics';
  const show = (next: LabTab) =>
    void navigate({ search: { tab: next === 'rubrics' ? undefined : next }, resetScroll: false });

  return (
    <Tabs selectedKey={tab} onSelectionChange={(key) => show(key as LabTab)}>
      <div className={`reading-width ${styles.page}`}>
        <PageHeader
          title={ru.nav.lab}
          focusHeadingOnMount
          description="Только на DEV: в прод этот раздел не попадает — ни пункт меню, ни код."
        />
        <TabList aria-label="Что тестируем">
          <Tab id="rubrics">Рубрики</Tab>
          <Tab id="autopublish">Автопубликация</Tab>
          <Tab id="background">Фоновые задачи</Tab>
        </TabList>
        <TabPanel id="rubrics">
          <div className={styles.panel}>
            <p className={styles.intro}>
              Собирается только нажатая рубрика: живые данные, текст пишет ИИ, картинку рисует код. Придёт вам в чат с
              ботом через 1–3 минуты, в канал ничего не уходит.
            </p>
            <RubricSamplesList />
          </div>
        </TabPanel>
        <TabPanel id="autopublish">
          <div className={styles.panel}>
            <p className={styles.intro}>
              Анонс Steam без поста проходит весь автоматический путь, как будто его только что нашёл Cron: ИИ пишет,
              проверяет факты и, если на DEV включена автопубликация, публикует без вас в канал из «Настройки → Общие».
            </p>
            <LabAutopublish timezone={timezone} />
          </div>
        </TabPanel>
        <TabPanel id="background">
          <BackgroundJobsEditor />
        </TabPanel>
      </div>
    </Tabs>
  );
}
