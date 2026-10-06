import { Button, Input, SearchField as AriaSearchField, type SearchFieldProps } from 'react-aria-components';
import { ru } from '../lib/ru';
import { Icon } from './Icon';
import styles from './SearchField.module.css';

type Props = Omit<SearchFieldProps, 'children' | 'className' | 'aria-label'> & {
  /** Accessible name; a search box is recognisable by its icon, so the label is not drawn. */
  label: string;
  placeholder?: string;
};

export function SearchField({ label, placeholder, ...rest }: Props) {
  return (
    <AriaSearchField {...rest} aria-label={label} className={styles.field}>
      <Icon name="search" size={18} className={styles.icon} />
      <Input className={styles.input} placeholder={placeholder} />
      <Button className={styles.clear} aria-label={ru.ui.clearSearch}>
        <Icon name="x" size={16} />
      </Button>
    </AriaSearchField>
  );
}
