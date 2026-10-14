import { PAGE_SIZE } from '../../../shared/api/page-query';
import { ru } from '../../../shared/lib/ru';
import {
  DataTable,
  FilterButton,
  Pagination,
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
import { copy } from './copy';
import { PUBLICATION_ROW_LOADING } from './PublicationTable';
import styles from './PublicationsSkeleton.module.css';

const noop = () => {};
const COLUMNS: DataColumn<{ id: string }>[] = [
  { id: 'time', width: 150, header: copy.list.columns.time, cell: () => null },
  { id: 'post', header: copy.list.columns.post, isRowHeader: true, cell: () => null },
  { id: 'channel', width: 220, header: copy.list.columns.channel, cell: () => null },
  { id: 'status', width: 170, header: copy.list.columns.status, cell: () => null },
  { id: 'message', width: 140, header: copy.list.columns.message, cell: () => null }
];

/** The publications page while the session is restored: the loaded geometry (tabs, panel, rows) and no request. */
export function PublicationsSkeleton() {
  const narrow = useMediaQuery('(max-width: 859px)');
  return (
    <div className={styles.root} aria-busy="true">
      <VisuallyHidden>
        <output>{ru.shell.loadingPage}</output>
      </VisuallyHidden>
      <Tabs selectedKey="all" isDisabled>
        <TabList aria-label={copy.tabs.label}>
          <Tab id="all">{copy.tabs.all}</Tab>
          <Tab id="upcoming">{narrow ? copy.tabs.upcomingShort : copy.tabs.upcoming}</Tab>
          <Tab id="recent">{narrow ? copy.tabs.recentShort : copy.tabs.recent}</Tab>
          <Tab id="errors">{copy.tabs.errors}</Tab>
        </TabList>
      </Tabs>
      <Panel
        title={narrow ? copy.list.title : copy.list.panel.all}
        reserveRows={narrow ? 6 : 8}
        footer={<Pagination page={1} pageSize={PAGE_SIZE} totalCount={0} onPageChange={() => {}} isLoading />}
      >
        {narrow ? (
          <>
            <PhoneToolbar>
              <PhoneToolbarSearch>
                <SearchField label={copy.filters.searchLabel} placeholder={copy.filters.phoneSearch} isDisabled />
              </PhoneToolbarSearch>
              <FilterButton
                count={0}
                sort={{ label: copy.filters.sort, value: '', spoken: '' }}
                isDisabled
                onPress={noop}
              />
            </PhoneToolbar>
            <PhoneSkeletonRows label={copy.list.tableLabel} />
          </>
        ) : (
          <DataTable
            flush
            rowHeight="tall"
            aria-label={copy.list.tableLabel}
            columns={COLUMNS}
            rows={[]}
            getRowId={(row) => row.id}
            isLoading
            loadingRows={PUBLICATION_ROW_LOADING}
          />
        )}
      </Panel>
    </div>
  );
}
