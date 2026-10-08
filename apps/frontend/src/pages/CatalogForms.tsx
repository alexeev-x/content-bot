import { CalendarDateTime, Time, ZonedDateTime, now, toZoned } from '@internationalized/date';
import { useState } from 'react';
import {
  Checkbox,
  ColorField,
  DateTimeField,
  Radio,
  RadioGroup,
  SearchField,
  SegmentedControl,
  Select,
  Switch,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  TextArea,
  TextField,
  TimeField
} from '../shared/ui';
import styles from './CatalogPage.module.css';

const OPTIONS = [
  { id: 'main', label: 'ALEXEEV — канал', description: 'Основной' },
  { id: 'test', label: 'Тестовый канал' },
  { id: 'old', label: 'Архив (недоступен)', isDisabled: true }
];
const SEGMENTS = [
  { id: 'day', label: 'День', icon: 'calendar' },
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' }
] as const;
const ZONE = 'Europe/Chisinau';
const LONG_TEXT = 'Патч 7.39c: что изменилось для керри. '.repeat(30);

export function CatalogForms() {
  const [select, setSelect] = useState<string | null>('main');
  const [segment, setSegment] = useState('week');
  const [color, setColor] = useState('#0f9d8a');
  const [when, setWhen] = useState<ZonedDateTime | null>(toZoned(new CalendarDateTime(2026, 10, 7, 14, 30), ZONE));
  const [later, setLater] = useState<ZonedDateTime | null>(null);
  const [time, setTime] = useState<Time | null>(new Time(10, 0));
  const [plan, setPlan] = useState('now');

  return (
    <>
      <h3 className={styles.group}>Text fields</h3>
      <div className={styles.stack}>
        <TextField label="Title" description="Shown in the post list." defaultValue="Герой дня: Invoker" />
        <TextField label="Required, empty" isRequired placeholder="Placeholder is not a label" />
        <TextField label="Invalid" defaultValue="x" errorMessage="Введите заголовок длиннее одного символа." />
        <TextField label="Disabled" defaultValue="Locked while publishing" isDisabled />
        <TextArea
          label="Body with counter"
          description="Telegram limit"
          limit={120}
          defaultValue="Короткий текст поста."
        />
        <TextArea label="Body over the limit" limit={120} defaultValue={LONG_TEXT.slice(0, 160)} rows={3} />
        <SearchField label="Search posts" placeholder="Search…" />
        <SearchField label="Search posts, filled" defaultValue="патч" />
        <SearchField label="Search disabled" isDisabled placeholder="Search…" />
      </div>

      <h3 className={styles.group}>Select</h3>
      <div className={styles.stack}>
        <Select label="Channel" options={OPTIONS} value={select} onChange={setSelect} />
        <Select
          label="Channel, empty"
          options={OPTIONS}
          value={null}
          onChange={() => undefined}
          description="Choose where to publish."
        />
        <Select
          label="Channel, invalid"
          options={OPTIONS}
          value={null}
          onChange={() => undefined}
          errorMessage="Выберите канал публикации."
        />
        <Select label="Channel, disabled" options={OPTIONS} value="test" onChange={() => undefined} isDisabled />
      </div>

      <h3 className={styles.group}>Checkbox, switch</h3>
      <div className={styles.stack}>
        <Checkbox>Unchecked</Checkbox>
        <Checkbox defaultSelected description="With a description line">
          Checked
        </Checkbox>
        <Checkbox isIndeterminate>Indeterminate</Checkbox>
        <Checkbox isInvalid>Invalid</Checkbox>
        <Checkbox isDisabled>Disabled</Checkbox>
        <Checkbox isDisabled defaultSelected>
          Disabled checked
        </Checkbox>
        <Switch>Off</Switch>
        <Switch defaultSelected>On</Switch>
        <Switch isDisabled>Disabled</Switch>
      </div>

      <h3 className={styles.group}>Radio, radio card, segmented</h3>
      <div className={styles.stack}>
        <RadioGroup label="Plain radios" defaultValue="a">
          <Radio value="a">Publish now</Radio>
          <Radio value="b">Schedule</Radio>
          <Radio value="c" isDisabled>
            Disabled
          </Radio>
        </RadioGroup>
        <RadioGroup label="Radio cards" variant="card" value={plan} onChange={setPlan}>
          <Radio value="now" description="Send immediately to the channel">
            Publish now
          </Radio>
          <Radio value="later" description="Pick a date and time">
            Schedule
          </Radio>
          <Radio value="off" isDisabled description="Not available">
            Disabled card
          </Radio>
        </RadioGroup>
        <RadioGroup label="Radio card, invalid" variant="card" errorMessage="Выберите способ публикации.">
          <Radio value="x">First</Radio>
          <Radio value="y">Second</Radio>
        </RadioGroup>
        <SegmentedControl label="Calendar view" options={SEGMENTS} value={segment} onChange={setSegment} />
        <SegmentedControl label="Disabled view" options={SEGMENTS} value="day" onChange={() => undefined} isDisabled />
      </div>

      <h3 className={styles.group}>Color, date, time</h3>
      <div className={styles.stack}>
        <ColorField
          label="Accent base color"
          value={color}
          onChange={setColor}
          description="Shades are derived for both themes."
        />
        <ColorField label="Disabled color" value="#1d4ed8" onChange={() => undefined} isDisabled />
        <DateTimeField label="Publish at" value={when} onChange={setWhen} timeZone={ZONE} />
        <DateTimeField
          label="Publish at, empty (default time, minValue now)"
          value={later}
          onChange={setLater}
          timeZone={ZONE}
          minValue={now(ZONE)}
          isRequired
        />
        <DateTimeField
          label="Publish at, invalid"
          value={when}
          onChange={() => undefined}
          timeZone={ZONE}
          errorMessage="Время публикации должно быть в будущем."
        />
        <TimeField label="Digest time" value={time} onChange={setTime} />
      </div>

      <h3 className={styles.group}>Tabs</h3>
      <Tabs defaultSelectedKey="post">
        <TabList aria-label="Post sections">
          <Tab id="post">Post</Tab>
          <Tab id="preview">Preview</Tab>
          <Tab id="locked" isDisabled>
            Disabled
          </Tab>
        </TabList>
        <TabPanel id="post">Editor content.</TabPanel>
        <TabPanel id="preview">Post preview.</TabPanel>
      </Tabs>
    </>
  );
}
