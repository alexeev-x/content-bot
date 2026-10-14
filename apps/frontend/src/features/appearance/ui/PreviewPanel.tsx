import { ru } from '../../../shared/lib/ru';
import { Icon, Panel, StatusBadge } from '../../../shared/ui';
import styles from './PreviewPanel.module.css';

/** Static mock of the real UI on the live tokens: it changes the moment an accent or a theme is chosen. */
export function PreviewPanel() {
  return (
    <Panel title={ru.appearance.previewTitle}>
      <div className={styles.body} aria-hidden="true">
        <div className={styles.nav}>
          <span className={styles.navItem} data-selected>
            <Icon name="channel" size={16} />
            {ru.appearance.previewNavSelected}
          </span>
          <span className={styles.navItem}>
            <Icon name="bell" size={16} />
            {ru.appearance.previewNavOther}
          </span>
        </div>
        <div className={styles.row}>
          <span className={styles.primary}>{ru.appearance.previewPrimary}</span>
          <StatusBadge status="scheduled" />
        </div>
        <span className={styles.link}>{ru.appearance.previewLink}</span>
        <div className={styles.chat}>
          <div className={styles.bubble}>
            <p className={styles.text}>{ru.appearance.previewPost}</p>
            <span className={styles.meta}>{ru.appearance.previewTime}</span>
          </div>
        </div>
      </div>
    </Panel>
  );
}
