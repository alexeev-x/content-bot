import type { ReactNode } from 'react';
import { Button, Icon, PageHeader, useToast, type IconName, type StatusGroup } from '../../shared/ui';
import { useProtoNavigate } from './proto-kit';
import styles from './Preview.module.css';

/** «Превью» tag after every preview h1. */
export function PreviewChip() {
  return (
    <span className={styles.previewChip}>
      <Icon name="flask" size={14} />
      Превью
    </span>
  );
}

/** Marks every chart, number block and list that is invented. */
export function DemoChip() {
  return (
    <span className={styles.demoChip} title="Демо-данные">
      демо
    </span>
  );
}

/** Permanent, not dismissable: a preview must never be mistaken for the working product. */
export function PreviewBanner() {
  const go = useProtoNavigate();
  return (
    <div className={styles.banner} role="note">
      <Icon name="info" size={18} />
      <p>
        <strong>Превью · демо-данные.</strong> Это пример интерфейса: ничего не сохраняется и не отправляется в
        Telegram.
      </p>
      <button type="button" className={styles.bannerLink} onClick={() => go('')}>
        Закрыть превью
      </button>
    </div>
  );
}

type PageProps = { title: string; actions?: ReactNode; children: ReactNode; focusHeadingOnMount?: boolean };

export function PreviewPage({ title, actions, children, focusHeadingOnMount = false }: PageProps) {
  return (
    <div className={styles.page}>
      <PageHeader title={title} marker={<PreviewChip />} actions={actions} focusHeadingOnMount={focusHeadingOnMount} />
      <PreviewBanner />
      {children}
    </div>
  );
}

/** Every write-like control in a preview answers with this toast and changes nothing. */
export function usePreviewToast() {
  const toast = useToast();
  return (text = 'Превью: действие не выполняется') => toast.show({ title: text, tone: 'info' });
}

type PillProps = { group: StatusGroup; icon: IconName; children: ReactNode };

/** Status pill with its own label: icon, text and tint, never colour alone. */
export function Pill({ group, icon, children }: PillProps) {
  return (
    <span className={styles.pill} data-group={group}>
      <Icon name={icon} size={14} />
      {children}
    </span>
  );
}

/** Neutral type or tag badge. */
export function Tag({ children }: { children: ReactNode }) {
  return <span className={styles.tag}>{children}</span>;
}

const hueOf = (seed: string) => {
  let hash = 7;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
};

type ThumbProps = { seed: string; label?: string; size?: number; broken?: boolean; fill?: boolean };

/** Generic gradient thumbnail drawn in CSS: no game art, no network. */
export function Thumb({ seed, label, size = 40, broken, fill }: ThumbProps) {
  const hue = hueOf(seed);
  return (
    <span
      className={styles.thumb}
      data-broken={broken || undefined}
      style={{
        width: fill ? '100%' : size,
        height: fill ? '100%' : size,
        ['--thumb-a' as string]: `hsl(${hue} 16% 34%)`,
        ['--thumb-b' as string]: `hsl(${(hue + 50) % 360} 14% 22%)`
      }}
      aria-hidden="true"
    >
      {broken ? <Icon name="x-circle" size={Math.max(14, Math.min(size / 2, 28))} /> : label}
    </span>
  );
}

/** Quiet text button for panel footers and inline links. */
export function LinkButton({ onPress, children }: { onPress: () => void; children: ReactNode }) {
  return (
    <Button variant="ghost" size="sm" onPress={onPress}>
      {children}
    </Button>
  );
}
