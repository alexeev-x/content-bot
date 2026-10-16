import { Icon, Panel, Skeleton } from '../../../shared/ui';
import row from './ChannelRow.module.css';
import { channelsCopy } from './copy';
import styles from './ChannelsList.module.css';

const ROWS = 3;

/** The channel list before its data exists: the real row grid (avatar, two lines, badge, chevron), no request. */
export function ChannelsSkeleton() {
  return (
    <Panel reserveRows={ROWS}>
      <output className={styles.list} aria-busy="true" aria-label={channelsCopy.list.loading}>
        {Array.from({ length: ROWS }, (_, key) => (
          <div key={key} className={row.item}>
            <div className={row.row} aria-hidden="true">
              <Skeleton width={40} height={40} radius="var(--radius-pill)" />
              <span className={row.main}>
                <span className={row.title}>
                  <Skeleton width="40%" height="1lh" />
                </span>
                <span className={row.meta}>
                  <Skeleton width="25%" height="1lh" />
                </span>
              </span>
              <span className={row.status}>
                <Skeleton width={88} height={22} radius="var(--radius-pill)" />
              </span>
              <Icon name="chevron-right" size={18} className={row.chevron} />
            </div>
          </div>
        ))}
      </output>
    </Panel>
  );
}
