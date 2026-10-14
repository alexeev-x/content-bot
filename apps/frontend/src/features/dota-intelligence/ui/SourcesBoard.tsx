import { FeedHealth } from './FeedHealth';
import { SourceFeed, type FeedFilters } from './SourceFeed';
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
