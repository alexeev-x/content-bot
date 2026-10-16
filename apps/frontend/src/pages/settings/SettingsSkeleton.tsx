import { AiSettingsSkeleton } from '../../features/ai-settings';
import { AppearanceSkeleton } from '../../features/appearance';
import { BotStatusSkeleton } from '../../features/bot';
import { AnalyticsSourcesSkeleton } from '../../features/content-analytics';
import { ChannelsSkeleton } from '../../features/destinations';
import { DotaWatchlistsSkeleton } from '../../features/dota-intelligence';
import { GeneralSettingsSkeleton } from '../../features/owner-settings';
import { useMediaQuery } from '../../shared/ui';
import styles from './GeneralPage.module.css';
import { SECTIONS, SettingsFrame } from './SettingsFrame';

function SectionSkeleton({ to }: { to: string }) {
  switch (to) {
    case '/settings/channels':
      return <ChannelsSkeleton />;
    case '/settings/analytics':
      return <AnalyticsSourcesSkeleton />;
    case '/settings/ai':
      return <AiSettingsSkeleton />;
    case '/settings/general':
      return (
        <div className={`reading-width ${styles.page}`}>
          <BotStatusSkeleton />
          <GeneralSettingsSkeleton />
          <DotaWatchlistsSkeleton />
        </div>
      );
    default:
      return <AppearanceSkeleton />;
  }
}

/** /settings/* while the session is restored: the real frame and the section's own skeleton, no request. */
export function SettingsSkeleton({ pathname }: { pathname: string }) {
  const wide = useMediaQuery('(min-width: 860px)');
  const section = SECTIONS.find((candidate) => pathname.startsWith(candidate.to));
  return (
    <SettingsFrame wide={wide} section={section}>
      {section ? <SectionSkeleton to={section.to} /> : null}
    </SettingsFrame>
  );
}
