import type { ContentPlatform, ContentReportPeriod } from '@alexeev/contracts';
import { Button, PageHeader, Select, Tab, TabList } from '../../../shared/ui';
import { PLATFORM_LABEL } from '../model/format';
import { PLATFORMS } from '../model/report';
import { copy } from './copy';
import { RefreshAnalyticsButton } from './RefreshAnalyticsButton';
import styles from './Report.module.css';

const PERIODS = [
  { id: '7', label: '7 дней' },
  { id: '30', label: '30 дней' },
  { id: '90', label: '90 дней' }
] as const;
const PLATFORM_FILTERS = [
  { id: 'all', label: copy.table.all },
  ...PLATFORMS.map((platform) => ({ id: platform, label: PLATFORM_LABEL[platform] }))
];

type Props = {
  description: string;
  days: ContentReportPeriod;
  platform: ContentPlatform | undefined;
  onDaysChange: (days: ContentReportPeriod) => void;
  onPlatformChange: (platform: ContentPlatform | undefined) => void;
  /** The route skeleton: the same header, inert, so no request or change leaves before the session exists. */
  inert?: boolean;
};

/** Title, section tabs, period and platform filters: one header for the loaded board and its skeleton. Lives inside `Tabs`. */
export function AnalyticsHeader({ description, days, platform, onDaysChange, onPlatformChange, inert = false }: Props) {
  return (
    <PageHeader
      title={copy.title}
      description={description}
      focusHeadingOnMount
      wideActions
      actions={
        <div className={styles.toolbar}>
          <TabList aria-label="Разделы аналитики">
            <Tab id="overview">Обзор</Tab>
            <Tab id="items">Публикации</Tab>
            <Tab id="audience">Аудитория</Tab>
          </TabList>
          <div className={styles.toolbarFilters}>
            <Select
              label={copy.filters.period}
              inlineLabel
              options={PERIODS}
              value={String(days)}
              isDisabled={inert}
              onChange={(id) => onDaysChange(Number(id) as ContentReportPeriod)}
            />
            <Select
              label={copy.filters.platform}
              inlineLabel
              options={PLATFORM_FILTERS}
              value={platform ?? 'all'}
              isDisabled={inert}
              onChange={(id) => onPlatformChange(id === 'all' ? undefined : (id as ContentPlatform))}
            />
            {inert ? (
              <Button variant="secondary" icon="retry" isDisabled>
                {copy.refresh}
              </Button>
            ) : (
              <RefreshAnalyticsButton />
            )}
          </div>
        </div>
      }
    />
  );
}
