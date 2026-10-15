import type { ContentPlatform } from '@alexeev/contracts';
import { Icon, type IconName } from '../../../shared/ui';
import { PLATFORM_LABEL } from '../model/format';
import styles from './ContentAnalytics.module.css';

const ICON: Record<ContentPlatform, IconName> = { telegram: 'send', youtube: 'play', tiktok: 'music' };

type Props = { platform: ContentPlatform; withLabel?: boolean };

/** Monochrome platform mark; the name is always there (as text or for assistive technology). */
export function PlatformGlyph({ platform, withLabel = false }: Props) {
  return (
    <span className={styles.glyph}>
      <span className={styles.glyphIcon} aria-hidden="true">
        <Icon name={ICON[platform]} size={14} />
      </span>
      {withLabel ? (
        <span>{PLATFORM_LABEL[platform]}</span>
      ) : (
        <span className={styles.srOnly}>{PLATFORM_LABEL[platform]}</span>
      )}
    </span>
  );
}
