import { useMemo } from 'react';
import { Button as AriaButton, ComboBox, Input, Label, ListBox, ListBoxItem, Popover } from 'react-aria-components';
import { ru } from '../../../shared/lib/ru';
import { Button, Icon } from '../../../shared/ui';
import { browserTimezone, timezoneOptions } from '../model/timezone-options';
import styles from './TimezoneField.module.css';

type Props = {
  value: string;
  now: Date;
  onChange: (timezone: string) => void;
};

/** Searchable zone list: type a city, a region or an offset. A zone is applied only by picking it from the list. */
export function TimezoneField({ value, now, onChange }: Props) {
  const options = useMemo(() => timezoneOptions(now, value), [now, value]);
  // The input shows the option's label, so the filter looks the extra search text (IANA id, offset) up by label.
  const searchByLabel = useMemo(() => new Map(options.map((option) => [option.label, option.search])), [options]);
  const browser = browserTimezone();
  const current = options.find((option) => option.id === value);

  return (
    <div className={styles.wrap}>
      <ComboBox
        className={styles.field}
        selectedKey={value}
        onSelectionChange={(key) => {
          if (key !== null) onChange(String(key));
        }}
        defaultFilter={(text, input) =>
          (searchByLabel.get(text) ?? text.toLowerCase()).includes(input.trim().toLowerCase())
        }
        menuTrigger="focus"
        allowsEmptyCollection
      >
        <Label className={styles.label}>{ru.general.timezoneLabel}</Label>
        <div className={styles.control}>
          <Input className={styles.input} placeholder={ru.general.timezonePlaceholder} />
          <AriaButton className={styles.toggle}>
            <Icon name="chevron-down" size={18} />
          </AriaButton>
        </div>
        <p className={styles.hint}>{ru.general.timezoneHint}</p>
        <Popover className={styles.popover} offset={6}>
          <ListBox
            className={styles.list}
            items={options}
            renderEmptyState={() => <p className={styles.empty}>{ru.general.timezoneEmpty}</p>}
          >
            {(option) => (
              <ListBoxItem id={option.id} textValue={option.label} className={styles.item}>
                <span>{option.label}</span>
                <span className={styles.itemId}>{option.id}</span>
                <Icon name="check" size={16} className={styles.check} />
              </ListBoxItem>
            )}
          </ListBox>
        </Popover>
      </ComboBox>
      <div className={styles.row}>
        {current ? <p className={styles.now}>{ru.general.timezoneNow(`${current.id}, ${current.offset}`)}</p> : null}
        {browser && browser !== value ? (
          <Button variant="secondary" size="field" onPress={() => onChange(browser)}>
            {ru.general.timezoneBrowser}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
