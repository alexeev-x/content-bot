import { PAGE_SIZE } from '../../../shared/api/page-query';
import { Pagination, Panel } from '../../../shared/ui';
import { FeedHealth } from './FeedHealth';
import { FeedCardsSkeleton, SourceFeed, type FeedFilters } from './SourceFeed';
import styles from './SourcesBoard.module.css';

type Props = {
  timezone: string;
  filters: FeedFilters;
  onFiltersChange: (patch: Partial<FeedFilters>) => void;
};

/** «Источники»: events become drafts, feed health in one quiet row above them. */
export function SourcesBoard({ timezone, filters, onFiltersChange }: Props) {
  return (
    <div className={styles.board}>
      <FeedHealth timezone={timezone} />
      <SourceFeed filters={filters} timezone={timezone} onFiltersChange={onFiltersChange} />
    </div>
  );
}

/** The page body before the session exists: the feed's panel with a page of cards, no request. */
export function SourcesBoardSkeleton() {
  return (
    <div className={styles.board}>
      <Panel footer={<Pagination page={1} pageSize={PAGE_SIZE} totalCount={0} onPageChange={() => {}} isLoading />}>
        <FeedCardsSkeleton />
      </Panel>
    </div>
  );
}
