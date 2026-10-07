import { useState } from 'react';
import {
  Banner,
  Button,
  DataTable,
  Popover,
  StatusBadge,
  StatusChip,
  SwatchRadio,
  SwatchRadioGroup,
  type DataColumn,
  type StatusKey
} from '../shared/ui';
import styles from './CatalogPage.module.css';

const SWATCHES = [
  { id: 'cobalt', name: 'Cobalt', color: '#1d4ed8' },
  { id: 'indigo', name: 'Indigo', color: '#4f46c8' },
  { id: 'copper', name: 'Copper', color: '#b4531c' },
  { id: 'orchid', name: 'Orchid', color: '#b0206f' },
  { id: 'mono', name: 'Mono', color: '#14170f' },
  { id: 'pale', name: 'Pale (own colour)', color: '#e8e8e8', disabled: true }
] as const;

type Row = { id: string; title: string; status: StatusKey; at: string; channel: string };
const ROWS: readonly Row[] = [
  { id: 'r1', title: 'Вышел новый релиз приложения', status: 'sent', at: '12:00', channel: '@alexeev' },
  {
    id: 'r2',
    title: 'Очень длинный заголовок поста, который не помещается в одну строку на телефоне',
    status: 'failed',
    at: '14:30',
    channel: '@alexeev'
  },
  { id: 'r3', title: 'Анонс', status: 'scheduled', at: '18:15', channel: '@news' }
];
const COLUMNS: readonly DataColumn<Row>[] = [
  { id: 'title', header: 'Title', isRowHeader: true, cell: (row) => row.title },
  { id: 'status', header: 'Status', compactSlot: 'trailing', cell: (row) => <StatusBadge status={row.status} /> },
  { id: 'at', header: 'When', cell: (row) => <span className="mono">{row.at}</span> },
  { id: 'channel', header: 'Channel', cell: (row) => row.channel }
];

/** Popover content stand-in: the real one lists the checks. */
function Details() {
  return <p>Бот: подключён · 12:00. Хранилище: доступно · 12:00.</p>;
}

export function CatalogStatus() {
  const [accent, setAccent] = useState('cobalt');
  const [open, setOpen] = useState(false);
  return (
    <>
      <h3 className={styles.group}>Status chip (healthy, one problem with action, several)</h3>
      <div className={styles.row}>
        <Popover trigger={<StatusChip tone="ok" label="Система в порядке" time="12:00" />} label="Состояние системы">
          <Details />
        </Popover>
      </div>
      <div className={styles.row}>
        <Popover
          isOpen={open}
          onOpenChange={setOpen}
          trigger={<StatusChip tone="danger" label="Бот не подключён" time="12:00" />}
          label="Состояние системы"
        >
          <Details />
        </Popover>
        <Button size="sm">Подключить</Button>
      </div>
      <div className={styles.row}>
        <Popover trigger={<StatusChip tone="warning" label="Требует внимания: 2" />} label="Состояние системы">
          <Details />
        </Popover>
      </div>

      <h3 className={styles.group}>Swatch radio</h3>
      <SwatchRadioGroup label="Accent color" value={accent} onChange={setAccent}>
        {SWATCHES.map((swatch) => (
          <SwatchRadio
            key={swatch.id}
            value={swatch.id}
            name={swatch.name}
            color={swatch.color}
            isDisabled={'disabled' in swatch}
          />
        ))}
      </SwatchRadioGroup>

      <h3 className={styles.group}>Banner with title and action</h3>
      <Banner
        tone="error"
        title="Бот не подключён"
        action={
          <Button size="sm" variant="secondary">
            Подключить
          </Button>
        }
      >
        Публикации не отправляются, пока бот не подключён к каналу.
      </Banner>

      <h3 className={styles.group}>Buttons by size: md, sm, field</h3>
      <div className={styles.row}>
        <Button variant="secondary">md 32</Button>
        <Button variant="secondary" size="sm">
          sm 28
        </Button>
        <Button variant="secondary" size="field">
          field 36
        </Button>
      </div>

      <h3 className={styles.group}>DataTable density=&quot;compact&quot; (list rows below 860 px)</h3>
      <DataTable
        aria-label="Compact rows"
        columns={COLUMNS}
        rows={ROWS}
        getRowId={(row) => row.id}
        density="compact"
        onRowAction={() => undefined}
      />
    </>
  );
}
