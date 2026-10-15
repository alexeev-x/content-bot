import { AnalyticsSources, RefreshAnalyticsButton } from '../../features/content-analytics';
import { SectionActions } from './section-actions';

/** Настройки → Аналитика: where the statistics come from, their state and the TikTok sign-in. */
export function AnalyticsSourcesPage() {
  return (
    <>
      <SectionActions>
        <RefreshAnalyticsButton />
      </SectionActions>
      <AnalyticsSources />
    </>
  );
}
