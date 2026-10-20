import type { ContentPlatform, ContentReportPeriod } from '@alexeev/contracts';
import { IconButton, PageHeader, SegmentedControl, Select, Tab, TabList } from '../../../shared/ui';
import { PLATFORM_LABEL } from '../model/format';
import { PLATFORMS } from '../model/report';
import { copy } from './copy';
import { RefreshAnalyticsButton } from './RefreshAnalyticsButton';
import styles from './Report.module.css';

// One tap instead of a dropdown, and short enough to share a phone row with the platform and «Обновить».
const PERIODS = [
  { id: '7', label: '7д' },
  { id: '30', label: '30д' },
  { id: '90', label: '90д' }
] as const;
const PLATFORM_FILTERS = [
  { id: 'all', label: 'Все платформы' },
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
            <Tab id="reports">Отчёты</Tab>
          </TabList>
          <div className={styles.toolbarFilters}>
            <SegmentedControl
              label={copy.filters.period}
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
              <IconButton variant="secondary" size="target" icon="retry" label={copy.refresh} isDisabled />
            ) : (
              <RefreshAnalyticsButton compact />
            )}
          </div>
        </div>
      }
    />
  );
}
