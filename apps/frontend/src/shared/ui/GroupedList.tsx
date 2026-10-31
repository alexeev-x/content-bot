import { useId, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import styles from './GroupedList.module.css';

export type ListGroup = {
  id: string;
  label: string;
  hint?: string;
  count?: number;
  defaultOpen?: boolean;
};

type Props = {
  groups: readonly ListGroup[];
  /** Rows of one group: usually a `PanelList` of `ListRow`s. */
  children: (groupId: string) => ReactNode;
  /** Headers become toggles (`aria-expanded`); groups start open unless `defaultOpen: false`. */
  collapsible?: boolean;
  /** Headers stick under `--sticky-offset` (set it from the page to clear the phone topbar). */
  stickyHeaders?: boolean;
  /** `bar`: left-aligned full-width header (rubric groups). `chip`: on a phone a centred day pill, as Telegram's date. */
  variant?: 'bar' | 'chip';
};

/** Groups of rows under sticky headers: day groups of the calendar and publications, rubric groups. */
export function GroupedList({ groups, children, collapsible = false, stickyHeaders = true, variant = 'bar' }: Props) {
  return (
    <div className={styles.list} data-variant={variant} data-sticky={stickyHeaders || undefined}>
      {groups.map((group) => (
        <Group key={group.id} group={group} collapsible={collapsible}>
          {children(group.id)}
        </Group>
      ))}
    </div>
  );
}

function Group({ group, collapsible, children }: { group: ListGroup; collapsible: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(group.defaultOpen !== false);
  const bodyId = useId();
  const label = (
    <>
      <span className={styles.label}>{group.label}</span>
      {group.count === undefined ? null : <span className={styles.count}>{group.count}</span>}
      {group.hint ? <span className={styles.hint}>{group.hint}</span> : null}
    </>
  );
  return (
    <section className={styles.group} aria-label={group.label}>
      <div className={styles.header} data-collapsible={collapsible || undefined}>
        {collapsible ? (
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => setOpen((value) => !value)}
          >
            <Icon name="chevron-right" size={16} className={styles.chevron} />
            {label}
          </button>
        ) : (
          <div className={styles.toggle}>{label}</div>
        )}
      </div>
      <div id={bodyId} hidden={collapsible && !open}>
        {children}
      </div>
    </section>
  );
}
