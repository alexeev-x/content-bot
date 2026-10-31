import type { RubricKey } from '@alexeev/contracts';
import { useState } from 'react';
import { Tab, TabList, TabPanel, Tabs } from '../../../shared/ui';
import { mskDay } from '../model/msk';
import { rubricsCopy as copy } from './copy';
import { RubricList } from './RubricList';
import { RubricsAnalytics } from './RubricsAnalytics';
import { analyticsCopy } from './analytics-copy';
import { RubricsForecast } from './RubricsForecast';
import { SchedulerPanel } from './SchedulerPanel';
import styles from './RubricsPage.module.css';

/** «Рубрики»: the switch on top, then the calendar (real slots and the forecast), the list of rubrics or
 * how they land (analytics). */
export function RubricsSection() {
  // Taken once per mount: the page shows «today» as it was when opened.
  const [today] = useState(() => mskDay(new Date().toISOString()));
  const [tab, setTab] = useState('calendar');
  const [openRubric, setOpenRubric] = useState<RubricKey | null>(null);
  return (
    <div className={styles.page}>
      <SchedulerPanel />
      <Tabs selectedKey={tab} onSelectionChange={(key) => setTab(String(key))}>
        <TabList aria-label={copy.tabs.label}>
          <Tab id="calendar">{copy.tabs.calendar}</Tab>
          <Tab id="rubrics">{copy.tabs.rubrics}</Tab>
          <Tab id="analytics">{analyticsCopy.tab}</Tab>
        </TabList>
        <TabPanel id="calendar">
          <div className={styles.page}>
            <RubricsForecast
              today={today}
              onOpenRubric={(key) => {
                setOpenRubric(key);
                setTab('rubrics');
              }}
            />
          </div>
        </TabPanel>
        <TabPanel id="rubrics">
          <RubricList openKey={openRubric} onOpenKeyChange={setOpenRubric} />
        </TabPanel>
        <TabPanel id="analytics">
          <RubricsAnalytics />
        </TabPanel>
      </Tabs>
    </div>
  );
}
