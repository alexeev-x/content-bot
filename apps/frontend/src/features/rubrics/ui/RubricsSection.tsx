import { useState } from 'react';
import { Tab, TabList, TabPanel, Tabs } from '../../../shared/ui';
import { mskDay } from '../model/msk';
import { rubricsCopy as copy } from './copy';
import { RubricList } from './RubricList';
import { RubricsForecast } from './RubricsForecast';
import { SchedulerPanel } from './SchedulerPanel';
import { UpcomingSlots } from './UpcomingSlots';
import styles from './RubricsPage.module.css';

/** «Рубрики»: the switch on top, then the calendar (real slots and the forecast) or the list of rubrics. */
export function RubricsSection() {
  // Taken once per mount: the page shows «today» as it was when opened.
  const [today] = useState(() => mskDay(new Date().toISOString()));
  return (
    <div className={styles.page}>
      <SchedulerPanel />
      <Tabs>
        <TabList aria-label={copy.tabs.label}>
          <Tab id="calendar">{copy.tabs.calendar}</Tab>
          <Tab id="rubrics">{copy.tabs.rubrics}</Tab>
        </TabList>
        <TabPanel id="calendar">
          <div className={styles.page}>
            <UpcomingSlots today={today} />
            <RubricsForecast />
          </div>
        </TabPanel>
        <TabPanel id="rubrics">
          <RubricList />
        </TabPanel>
      </Tabs>
    </div>
  );
}
