import { ru } from '../lib/ru';
import { Icon } from './Icon';
import styles from './Pagination.module.css';

type Props = {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  /** A search is settling: the range is replaced by a quiet «Ищем…» while the rows stay in place. */
  isSearching?: boolean;
  /** First load: the footer keeps its height and shows «Загрузка…». */
  isLoading?: boolean;
};

type Slot = number | 'gap-start' | 'gap-end';

/** First and last page always, the current one with a neighbour on each side, gaps for the rest. */
export function pageSlots(page: number, pages: number): Slot[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, 'gap-end', pages];
  if (page >= pages - 3) return [1, 'gap-start', pages - 4, pages - 3, pages - 2, pages - 1, pages];
  return [1, 'gap-start', page - 1, page, page + 1, 'gap-end', pages];
}

export function Pagination({ page, pageSize, totalCount, onPageChange, isSearching, isLoading }: Props) {
  const copy = ru.ui.pagination;
  const pages = Math.max(1, Math.ceil(totalCount / pageSize));
  const current = Math.min(page, pages);
  const from = totalCount === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, totalCount);
  return (
    <div className={styles.root}>
      <span className={styles.range} aria-live="polite">
        {isLoading
          ? ru.ui.loading
          : isSearching
            ? copy.searching
            : totalCount === 0
              ? copy.empty
              : copy.range(from, to, totalCount)}
      </span>
      {pages > 1 && !isLoading ? (
        <nav aria-label={copy.label} className={styles.nav}>
          <button
            type="button"
            className={styles.button}
            aria-label={copy.previous}
            disabled={current <= 1}
            onClick={() => onPageChange(current - 1)}
          >
            <Icon name="chevron-left" size={16} />
          </button>
          <ol className={styles.list}>
            {pageSlots(current, pages).map((slot) =>
              typeof slot === 'number' ? (
                <li key={slot}>
                  <button
                    type="button"
                    className={styles.button}
                    aria-label={copy.page(slot)}
                    aria-current={slot === current ? 'page' : undefined}
                    onClick={() => onPageChange(slot)}
                  >
                    {slot}
                  </button>
                </li>
              ) : (
                <li key={slot} className={styles.gap} aria-hidden="true">
                  …
                </li>
              )
            )}
          </ol>
          <span className={styles.status}>{copy.status(current, pages)}</span>
          <button
            type="button"
            className={styles.button}
            aria-label={copy.next}
            disabled={current >= pages}
            onClick={() => onPageChange(current + 1)}
          >
            <Icon name="chevron-right" size={16} />
          </button>
        </nav>
      ) : null}
    </div>
  );
}
