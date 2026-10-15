import type { ContentPlatform } from '@alexeev/contracts';
import { PLATFORM_LABEL } from '../model/format';
import styles from './ContentAnalytics.module.css';
import { PlatformLogo } from './PlatformLogo';

type Props = { platform: ContentPlatform; withLabel?: boolean; size?: number };

/** The platform's logo; the name is always there (as text or for assistive technology). */
export function PlatformGlyph({ platform, withLabel = false, size = 18 }: Props) {
  return (
    <span className={styles.glyph}>
      <PlatformLogo platform={platform} size={size} />
      {withLabel ? (
        <span>{PLATFORM_LABEL[platform]}</span>
      ) : (
        <span className={styles.srOnly}>{PLATFORM_LABEL[platform]}</span>
      )}
    </span>
  );
}
