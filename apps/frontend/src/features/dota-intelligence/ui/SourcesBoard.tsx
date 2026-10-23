import { PAGE_SIZE } from '../../../shared/api/page-query';
import { DataTable, Pagination, Panel } from '../../../shared/ui';
import { FeedHealth } from './FeedHealth';
import { SourceTable, type SourceTableView } from './SourceTable';
import styles from './SourcesBoard.module.css';

type Props = {
  timezone: string;
  state: SourceTableView;
  onChange: (patch: Partial<SourceTableView>) => void;
  /** DEV only: the side panel offers the automatic publishing test. */
  autopublishTest?: boolean;
};

/** «Источники»: feed health in one quiet row, then every event in one table; a row opens its side panel. */
export function SourcesBoard({ timezone, state, onChange, autopublishTest = false }: Props) {
  return (
    <div className={styles.board}>
      <FeedHealth timezone={timezone} />
      <SourceTable state={state} timezone={timezone} onChange={onChange} autopublishTest={autopublishTest} />
    </div>
  );
}

/** The page body before the session exists: the table's panel with a page of skeleton rows, no request. */
export function SourcesBoardSkeleton() {
  return (
    <div className={styles.board}>
      <Panel footer={<Pagination page={1} pageSize={PAGE_SIZE} totalCount={0} onPageChange={() => {}} isLoading />}>
        <DataTable
          aria-label="Загрузка событий"
          columns={[
            { id: 'title', header: 'Событие', isRowHeader: true, cell: () => null },
            { id: 'date', header: 'Опубликовано', width: 160, cell: () => null },
            { id: 'status', header: 'Статус', width: 200, compactSlot: 'trailing', cell: () => null }
          ]}
          rows={[]}
          getRowId={() => ''}
          isLoading
          loadingRows={PAGE_SIZE}
          density="compact"
          rowHeight="tall"
          flush
        />
      </Panel>
    </div>
  );
}
