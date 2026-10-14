import { FeedHealth } from './FeedHealth';
import { HeroStatistics } from './HeroStatistics';
import { SourceFeed, type FeedFilters } from './SourceFeed';
import { Tab, TabList, TabPanel, Tabs } from '../../../shared/ui';
import styles from './SourcesBoard.module.css';

export type SourcesView = 'feed' | 'heroes';

type Props = {
  timezone: string;
  view: SourcesView;
  onViewChange: (view: SourcesView) => void;
  filters: FeedFilters;
  onFiltersChange: (patch: Partial<FeedFilters>) => void;
};

/** «Источники»: events become drafts (Лента), hero statistics next to it, feed health in one quiet row. */
export function SourcesBoard({ timezone, view, onViewChange, filters, onFiltersChange }: Props) {
  return (
    <div className={styles.board}>
      <FeedHealth timezone={timezone} />
      <Tabs selectedKey={view} onSelectionChange={(key) => onViewChange(key as SourcesView)}>
        <TabList aria-label="Разделы источников">
          <Tab id="feed">Лента</Tab>
          <Tab id="heroes">Статистика героев</Tab>
        </TabList>
        <TabPanel id="feed">
          <SourceFeed filters={filters} timezone={timezone} onFiltersChange={onFiltersChange} />
        </TabPanel>
        <TabPanel id="heroes">
          <HeroStatistics />
        </TabPanel>
      </Tabs>
    </div>
  );
}
