import type { ReactNode } from 'react';
import { Button, Drawer, Icon, PanelList, Skeleton } from '../../shared/ui';
import type { Channel } from './data';
import styles from './Proto.module.css';

export const channelName = (channels: readonly Channel[], id: string) =>
  channels.find((channel) => channel.id === id)?.name ?? '—';

/** Short channel label for meta lines: the long Dota Pulse name is cut at the colon. */
export const shortChannel = (name: string) => name.split(':')[0] ?? name;

/** Phone skeleton rows: same 72 px geometry as RowCard, so data arrival changes nothing. */
export function PhoneSkeletonRows({ count = 6, label, thumb }: { count?: number; label: string; thumb?: boolean }) {
  return (
    <PanelList aria-label={label}>
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className={styles.skeletonCard} data-thumb={thumb || undefined}>
          {thumb ? <Skeleton width={44} height={44} /> : null}
          <div className={styles.skeletonBody}>
            <div className={styles.skeletonTop}>
              <Skeleton height={16} width={index % 2 ? '58%' : '72%'} />
              <Skeleton height={22} width={88} radius="var(--radius-pill)" />
            </div>
            <Skeleton height={12} width="44%" />
          </div>
        </li>
      ))}
    </PanelList>
  );
}

type FilterButtonProps = { count: number; onPress: () => void };
export function FilterButton({ count, onPress }: FilterButtonProps) {
  return (
    <Button variant="secondary" icon="settings" onPress={onPress}>
      Фильтры{count > 0 ? ` (${count})` : ''}
    </Button>
  );
}

type SheetProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  onReset: () => void;
  onApply: () => void;
  children: ReactNode;
};

/** Phone filter sheet: one place for every filter and the sort, applied together. */
export function FilterSheet({ isOpen, onOpenChange, count, onReset, onApply, children }: SheetProps) {
  return (
    <Drawer
      variant="bottom"
      title={count > 0 ? `Фильтры (${count})` : 'Фильтры'}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      footer={
        <>
          <Button variant="secondary" onPress={onReset}>
            Сбросить
          </Button>
          <Button onPress={onApply}>Показать результаты</Button>
        </>
      }
    >
      <div className={styles.sheetFields}>{children}</div>
    </Drawer>
  );
}

export type Chip = { id: string; label: string };

/** Applied-filter echo: removable chips, shown only while a filter is active. Never navigation. */
export function AppliedChips({ chips, onRemove }: { chips: readonly Chip[]; onRemove: (id: string) => void }) {
  if (chips.length === 0) return null;
  return (
    <ul className={styles.chips} aria-label="Применённые фильтры">
      {chips.map((chip) => (
        <li key={chip.id}>
          <button type="button" className={styles.chip} onClick={() => onRemove(chip.id)}>
            {chip.label}
            <Icon name="x" size={14} />
            <span className={styles.srOnly}>, убрать</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Panel footer line: count on the left, one quiet action on the right. */
export function FooterLine({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <>
      <span aria-live="polite">{text}</span>
      {action}
    </>
  );
}
