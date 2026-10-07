import { useState } from 'react';
import { SidebarPreview } from '../app/layouts/AppShell';
import { Button, Card, DataTable, IconButton, SearchField, Select, StatusBadge, TextField } from '../shared/ui';
import styles from './CatalogPage.module.css';

const ROWS = [
  { id: '1', title: 'Герой дня: Invoker', status: 'scheduled' as const },
  { id: '2', title: 'Патч 7.38: что изменилось', status: 'sent' as const },
  { id: '3', title: 'Итоги недели', status: 'failed' as const }
];
const COLUMNS = [
  { id: 'title', header: 'Title', cell: (row: (typeof ROWS)[number]) => row.title, isRowHeader: true },
  { id: 'status', header: 'Status', cell: (row: (typeof ROWS)[number]) => <StatusBadge status={row.status} /> }
];
const OPTIONS = [{ id: 'main', label: 'ALEXEEV — канал' }];

/** Fine pointer = compact tokens; the coarse scope forces the touch values the media query gives on phones. */
function Sizes({ coarse }: { coarse: boolean }) {
  const [channel, setChannel] = useState<string | null>('main');
  return (
    <div className={styles.sizes} data-pointer={coarse ? 'coarse' : 'fine'}>
      <strong className={styles.sampleName}>{coarse ? 'Coarse pointer / ≤859 px' : 'Fine pointer'}</strong>
      <div className={styles.row}>
        <Button variant="primary">Primary</Button>
        <Button>Secondary</Button>
        <Button size="sm">Small</Button>
        <IconButton label="Add" icon="plus" variant="secondary" />
      </div>
      <div className={styles.row}>
        <TextField label="Title" defaultValue="Герой дня" />
        <SearchField label="Search" placeholder="Search…" />
        <Select label="Channel" options={OPTIONS} value={channel} onChange={setChannel} />
      </div>
      <DataTable aria-label="Rows" columns={COLUMNS} rows={ROWS} getRowId={(row) => row.id} />
      <Card title="Card">Flat border, no shadow, 16 px padding.</Card>
    </div>
  );
}

export function CatalogDensity() {
  return (
    <>
      <h3 className={styles.group}>Density (fine and coarse)</h3>
      <div className={styles.stack}>
        <Sizes coarse={false} />
        <Sizes coarse />
      </div>
      <h3 className={styles.group}>Sidebar: active mark, expanded and collapsed</h3>
      <div className={styles.row}>
        <SidebarPreview collapsed={false} />
        <SidebarPreview collapsed />
      </div>
    </>
  );
}
