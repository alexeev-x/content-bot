import { useContext, useMemo } from 'react';
import {
  Button as AriaButton,
  ComboBox,
  ComboBoxStateContext,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  ListLayout,
  Popover,
  Virtualizer
} from 'react-aria-components';
import { ru } from '../../../shared/lib/ru';
import { Button, Icon, Skeleton } from '../../../shared/ui';
import { browserTimezone, timezoneOptions } from '../model/timezone-options';
import styles from './TimezoneField.module.css';

type Props = {
  value: string;
  now: Date;
  onChange: (timezone: string) => void;
};

const ROW_HEIGHT = 48;

/** The field itself opens the list on click, like a select; typing filters it. */
function OpeningInput() {
  const state = useContext(ComboBoxStateContext);
  return (
    <Input
      className={styles.input}
      placeholder={ru.general.timezonePlaceholder}
      onClick={() => {
        if (state && !state.isOpen) state.open(null, 'manual');
      }}
    />
  );
}

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
        // «input» (not «focus»): with «focus» a press on the chevron first opened the list on focus and then
        // toggled it shut — the field blinked and never stayed open. A click on the field opens it below.
        menuTrigger="input"
        allowsEmptyCollection
      >
        <Label className={styles.label}>{ru.general.timezoneLabel}</Label>
        <div className={styles.control}>
          <OpeningInput />
          <AriaButton className={styles.toggle}>
            <Icon name="chevron-down" size={18} />
          </AriaButton>
        </div>
        <p className={styles.hint}>{ru.general.timezoneHint}</p>
        <Popover className={styles.popover} offset={6}>
          {/* ~420 zones: only the visible rows are rendered, so the list opens at once. */}
          <Virtualizer layout={ListLayout} layoutOptions={{ rowHeight: ROW_HEIGHT }}>
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
          </Virtualizer>
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

/** The field before the settings arrive: its label, box and hint in place, placeholders for the value and «Сейчас». */
export function TimezoneFieldSkeleton() {
  return (
    <div className={styles.wrap} aria-hidden="true">
      <div className={styles.field}>
        <span className={styles.label}>{ru.general.timezoneLabel}</span>
        <Skeleton height="var(--size-control)" radius="var(--radius-2)" />
        <p className={styles.hint}>{ru.general.timezoneHint}</p>
      </div>
      <div className={styles.row}>
        <p className={styles.now}>
          <Skeleton width={220} height="1lh" />
        </p>
      </div>
    </div>
  );
}
