import { Button as AriaButton } from 'react-aria-components';
import { Button } from './Button';
import { Icon } from './Icon';
import styles from './ActiveFilters.module.css';

export type ActiveFilter = { id: string; label: string; onRemove: () => void };

type Props = {
  filters: readonly ActiveFilter[];
  onResetAll: () => void;
  /** «Сбросить всё». */
  resetLabel: string;
  /** Spoken before the chips: «Включённые фильтры». */
  label: string;
};

/** What narrows the list right now, each removable on its own, plus one reset. Renders nothing when nothing is on. */
export function ActiveFilters({ filters, onResetAll, resetLabel, label }: Props) {
  if (filters.length === 0) return null;
  return (
    <div className={styles.row}>
      <ul className={styles.list} aria-label={label}>
        {filters.map((filter) => (
          <li key={filter.id} className={styles.chip}>
            <span className={styles.text}>{filter.label}</span>
            <AriaButton
              className={styles.remove}
              aria-label={`Убрать фильтр: ${filter.label}`}
              onPress={filter.onRemove}
            >
              <Icon name="x" size={14} />
            </AriaButton>
          </li>
        ))}
      </ul>
      {filters.length > 1 ? (
        <Button size="sm" variant="ghost" onPress={onResetAll}>
          {resetLabel}
        </Button>
      ) : null}
    </div>
  );
}
