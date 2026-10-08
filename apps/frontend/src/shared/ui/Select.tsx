import {
  FieldError,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select as AriaSelect,
  SelectValue,
  Text,
  Button,
  type SelectProps
} from 'react-aria-components';
import { ru } from '../lib/ru';
import styles from './Field.module.css';
import { Icon } from './Icon';
import selectStyles from './Select.module.css';

export type SelectOption = { id: string; label: string; description?: string; isDisabled?: boolean };

type Props = Omit<
  SelectProps<SelectOption>,
  'children' | 'className' | 'items' | 'selectedKey' | 'onSelectionChange' | 'onChange'
> & {
  label: string;
  options: readonly SelectOption[];
  value: string | null;
  onChange: (id: string) => void;
  description?: string;
  errorMessage?: string;
  placeholder?: string;
  /** Toolbar style: the label sits inside the field as a prefix («Статус: Все») and stays the accessible name. */
  inlineLabel?: boolean;
};

export function Select({
  label,
  options,
  value,
  onChange,
  description,
  errorMessage,
  placeholder,
  inlineLabel = false,
  isInvalid,
  ...rest
}: Props) {
  return (
    <AriaSelect
      {...rest}
      selectedKey={value}
      onSelectionChange={(key) => {
        if (key !== null) onChange(String(key));
      }}
      isInvalid={isInvalid || Boolean(errorMessage)}
      placeholder={placeholder ?? ru.ui.selectPlaceholder}
      className={inlineLabel ? `${styles.field} ${selectStyles.inline}` : styles.field}
    >
      <Label className={inlineLabel ? selectStyles.hiddenLabel : styles.label}>{label}</Label>
      <Button className={`${styles.input} ${selectStyles.trigger}`}>
        {inlineLabel ? (
          <span className={selectStyles.prefix} aria-hidden="true">
            {label}:
          </span>
        ) : null}
        <SelectValue className={selectStyles.value} />
        <Icon name="chevron-down" size={18} className={selectStyles.chevron} />
      </Button>
      {description ? (
        <Text slot="description" className={styles.description}>
          {description}
        </Text>
      ) : null}
      <FieldError className={styles.error}>{errorMessage}</FieldError>
      <Popover className={selectStyles.popover} offset={6}>
        <ListBox className={selectStyles.list} items={options}>
          {(option) => (
            <ListBoxItem
              id={option.id}
              textValue={option.label}
              isDisabled={option.isDisabled}
              className={selectStyles.item}
            >
              <span>{option.label}</span>
              {option.description ? (
                <Text slot="description" className={selectStyles.itemDescription}>
                  {option.description}
                </Text>
              ) : null}
              <Icon name="check" size={16} className={selectStyles.check} />
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </AriaSelect>
  );
}
