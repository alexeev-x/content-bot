import { AnalyticsSources, RefreshAnalyticsButton, RubricsSettings } from '../../features/content-analytics';
import { SectionActions } from './section-actions';

/** Настройки → Аналитика: where the statistics come from, their state, the TikTok sign-in and the Telegram rubrics. */
export function AnalyticsSourcesPage() {
  return (
    <>
      <SectionActions>
        <RefreshAnalyticsButton />
      </SectionActions>
      <AnalyticsSources />
      <RubricsSettings />
    </>
  );
}
