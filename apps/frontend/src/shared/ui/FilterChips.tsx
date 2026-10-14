import { Tag, TagGroup, TagList, type Key } from 'react-aria-components';
import styles from './FilterChips.module.css';

export type FilterChip = { id: string; label: string; count?: number | undefined };

type Props = {
  /** Names the group for assistive technology: «Фильтр активности». */
  label: string;
  chips: readonly FilterChip[];
  value: string;
  onChange: (id: string) => void;
};

/**
 * One choice from a row of chips (React Aria TagGroup, single selection that cannot be emptied). The row scrolls
 * sideways on a narrow screen instead of wrapping, so the content below never jumps when a count changes.
 */
export function FilterChips({ label, chips, value, onChange }: Props) {
  return (
    <TagGroup
      aria-label={label}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[value]}
      onSelectionChange={(keys) => {
        const [first] = [...keys] as Key[];
        if (first !== undefined) onChange(String(first));
      }}
      className={styles.group}
    >
      <TagList className={styles.list}>
        {chips.map((chip) => (
          <Tag key={chip.id} id={chip.id} textValue={chip.label} className={styles.chip}>
            {chip.label}
            {chip.count !== undefined ? <span className={styles.count}>{chip.count}</span> : null}
          </Tag>
        ))}
      </TagList>
    </TagGroup>
  );
}
