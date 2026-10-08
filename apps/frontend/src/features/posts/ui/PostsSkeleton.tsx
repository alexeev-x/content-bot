import { ru } from '../../../shared/lib/ru';
import {
  DataTable,
  FilterButton,
  FooterLine,
  Panel,
  PhoneSkeletonRows,
  PhoneToolbar,
  PhoneToolbarSearch,
  SearchField,
  Tab,
  TabList,
  Tabs,
  VisuallyHidden,
  useMediaQuery,
  type DataColumn
} from '../../../shared/ui';
import { postsCopy } from './copy';
import { POST_ROW_LOADING } from './PostRows';
import styles from './PostsSkeleton.module.css';

const copy = postsCopy.list;
const noop = () => {};
const COLUMNS: DataColumn<{ id: string }>[] = [
  { id: 'title', header: copy.columns.title, isRowHeader: true, cell: () => null },
  { id: 'status', header: copy.columns.status, cell: () => null },
  { id: 'updated', header: copy.columns.updated, cell: () => null },
  { id: 'menu', header: copy.columns.actions, align: 'end', cell: () => null }
];

/** The posts page while the session is restored: the loaded geometry (tabs, panel, rows) and no request. */
export function PostsSkeleton() {
  const narrow = useMediaQuery('(max-width: 859px)');
  return (
    <div className={styles.root} aria-busy="true">
      <VisuallyHidden>
        <output>{ru.shell.loadingPage}</output>
      </VisuallyHidden>
      <Tabs selectedKey="all" isDisabled>
        <TabList aria-label={copy.tabs.label}>
          <Tab id="all">{copy.tabs.all}</Tab>
          <Tab id="drafts">{copy.tabs.drafts}</Tab>
          <Tab id="archive">{copy.tabs.archive}</Tab>
        </TabList>
      </Tabs>
      <Panel title={copy.panel.all} reserveRows={narrow ? 6 : 8} footer={<FooterLine text={copy.loadingMore} />}>
        {narrow ? (
          <>
            <PhoneToolbar>
              <PhoneToolbarSearch>
                <SearchField label={copy.searchLabel} placeholder={copy.filters.phoneSearch} isDisabled />
              </PhoneToolbarSearch>
              <FilterButton
                count={0}
                sort={{ label: copy.filters.sort, value: '', spoken: '' }}
                isDisabled
                onPress={noop}
              />
            </PhoneToolbar>
            <PhoneSkeletonRows label={copy.tableLabel} />
          </>
        ) : (
          <DataTable
            flush
            rowHeight="tall"
            aria-label={copy.tableLabel}
            columns={COLUMNS}
            rows={[]}
            getRowId={(row) => row.id}
            isLoading
            loadingRows={POST_ROW_LOADING}
          />
        )}
      </Panel>
    </div>
  );
}
