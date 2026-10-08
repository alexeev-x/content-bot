import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Icon, type IconName } from '../../shared/ui';
import { BASE, useProtoPath } from './proto-kit';
import styles from './PreviewNav.module.css';

export const PREVIEW_ITEMS: ReadonlyArray<{ path: string; label: string; icon: IconName }> = [
  { path: 'analytics', label: 'Аналитика', icon: 'sparkle' },
  { path: 'calendar', label: 'Календарь', icon: 'calendar' },
  { path: 'media', label: 'Медиатека', icon: 'image' },
  { path: 'automations', label: 'Автоматизации', icon: 'zap' },
  { path: 'sources', label: 'Источники', icon: 'link' }
];
export const isPreviewPath = (path: string) => PREVIEW_ITEMS.some((item) => item.path === path);

const KEY = 'proto-preview-nav-open';
const read = () => {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

/** Sidebar group «Превью»: collapsed by default, remembered per browser. In the icon rail it shrinks to one flask. */
export function PreviewNavGroup() {
  const path = useProtoPath();
  const [stored, setStored] = useState(read);
  const open = stored || isPreviewPath(path);
  const toggle = () => {
    const next = !open;
    setStored(next);
    try {
      window.localStorage.setItem(KEY, next ? '1' : '0');
    } catch {
      // Not persisted: the choice still applies for this session.
    }
  };
  return (
    <div className={styles.group}>
      <button
        type="button"
        className={styles.header}
        aria-expanded={open}
        aria-controls="preview-nav-list"
        title="Превью: экспериментальные страницы"
        onClick={toggle}
      >
        <Icon name="flask" size={20} />
        <span className={styles.headerText}>Превью</span>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} className={styles.chevron} />
      </button>
      <ul id="preview-nav-list" className={styles.list} hidden={!open}>
        {PREVIEW_ITEMS.map((item) => (
          <li key={item.path}>
            <Link to={`${BASE}/${item.path}` as never} className={styles.link}>
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
              <span className={styles.tag}>Превью</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Phone: the same five items as a section of the «Ещё» sheet, under Настройки. */
export function PreviewMoreSection({ onNavigate }: { onNavigate: () => void }) {
  return (
    <section className={styles.more} aria-labelledby="preview-more-title">
      <h3 id="preview-more-title" className={styles.moreTitle}>
        Превью
      </h3>
      <ul className={styles.moreList}>
        {PREVIEW_ITEMS.map((item) => (
          <li key={item.path}>
            <Link to={`${BASE}/${item.path}` as never} className={styles.moreLink} onClick={onNavigate}>
              <Icon name={item.icon} size={20} />
              <span>{item.label}</span>
              <span className={styles.tag}>Превью</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
