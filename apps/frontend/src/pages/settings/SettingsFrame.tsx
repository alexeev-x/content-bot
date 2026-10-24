import { Link } from '@tanstack/react-router';
import type { ReactNode, Ref } from 'react';
import { ru } from '../../shared/lib/ru';
import { isInsideTelegram } from '../../shared/telegram/web-app';
import { Icon, PageHeader, type IconName } from '../../shared/ui';
import styles from './SettingsLayout.module.css';

export const SECTIONS = [
  { to: '/settings/channels', label: ru.settings.channels, icon: 'channel' },
  { to: '/settings/analytics', label: ru.settings.analytics, icon: 'chart' },
  { to: '/settings/ai', label: ru.settings.ai, icon: 'sparkle' },
  { to: '/settings/general', label: ru.settings.general, icon: 'settings' },
  { to: '/settings/appearance', label: ru.settings.appearance, icon: 'sparkle' }
] as const satisfies readonly { to: string; label: string; icon: IconName }[];

export type SectionPath = (typeof SECTIONS)[number]['to'];
export type Section = (typeof SECTIONS)[number];

type Props = {
  wide: boolean;
  section: Section | undefined;
  /** The element a section page fills with its header actions (the real layout only). */
  slot?: ReactNode;
  /** Lets the layout remember each row, to focus the one that was open on the way back. */
  rowRef?: (to: SectionPath) => Ref<HTMLAnchorElement>;
  children: ReactNode;
};

/** The settings chrome (back link, header, section list, detail wrapper): one tree for the real layout and its skeleton. */
export function SettingsFrame({ wide, section, slot, rowRef, children }: Props) {
  const atList = section === undefined;
  return (
    <>
      {!wide && section && !isInsideTelegram() ? (
        <Link to="/settings" className={styles.back}>
          <Icon name="chevron-left" size={16} />
          {ru.settings.back}
        </Link>
      ) : null}
      <PageHeader
        title={wide || atList ? ru.pages.settings : (section?.label ?? ru.pages.settings)}
        actions={wide ? undefined : slot}
      />
      <div className={styles.layout} data-wide={wide || undefined}>
        {wide || atList ? (
          <nav aria-label={ru.settings.navLabel} className={styles.nav}>
            {SECTIONS.map((item) => (
              <Link key={item.to} to={item.to} className={styles.link} {...(rowRef ? { ref: rowRef(item.to) } : {})}>
                <Icon name={item.icon} size={18} />
                <span className={styles.label}>{item.label}</span>
                {wide ? null : <Icon name="chevron-right" size={18} />}
              </Link>
            ))}
          </nav>
        ) : null}
        {atList ? (
          children
        ) : (
          <section className={styles.detail} aria-label={section.label}>
            {wide ? (
              <div className={styles.detailHeader}>
                <h2 className={styles.detailTitle}>{section.label}</h2>
                {slot}
              </div>
            ) : null}
            {children}
          </section>
        )}
      </div>
    </>
  );
}
