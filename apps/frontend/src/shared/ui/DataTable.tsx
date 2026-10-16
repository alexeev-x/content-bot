import { useMemo, type ReactNode } from 'react';
import {
  Cell,
  Collection,
  Column,
  I18nProvider,
  Row,
  Table,
  TableBody,
  TableHeader,
  type Selection,
  type SortDescriptor
} from 'react-aria-components';
import { ru } from '../lib/ru';
import { Checkbox } from './Checkbox';
import styles from './DataTable.module.css';
import { Icon } from './Icon';
import { Select } from './Select';
import { Skeleton } from './Skeleton';
import { useMediaQuery } from './use-media-query';

export type DataColumn<T> = {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** The cell that names the row: the card title on narrow screens and the row header for screen readers. */
  isRowHeader?: boolean;
  allowsSorting?: boolean;
  /** Wide screens: a filter control (search or filter) after the header label. */
  headerControl?: ReactNode;
  align?: 'start' | 'end';
  /** Wide screens: the column's width (px number or CSS length). The table is `table-layout: fixed`, so these widths, set once here, hold for skeleton rows, data rows and every page; columns without one share the rest. */
  width?: number | string;
  /** `density="compact"` on narrow screens: `trailing` puts the cell (a status) at the right of the title; the other columns form one meta line. */
  compactSlot?: 'trailing';
  /** Placeholder of this cell while loading, when the cell is taller than a line of text (a thumbnail with two lines). Used by the card title on narrow screens. */
  skeleton?: ReactNode;
};

export type RowSelection = 'all' | ReadonlySet<string>;
export type TableSort = { column: string; direction: 'ascending' | 'descending' };

type Props<T> = {
  'aria-label': string;
  columns: readonly DataColumn<T>[];
  rows: readonly T[];
  getRowId: (row: T) => string;
  /** The text of a whole row (every column): the accessible text value of the row. */
  getRowText?: (row: T) => string;
  /** Sorting itself is the caller's job (server-side or TanStack Table); this component only shows and reports it. */
  sort?: TableSort;
  onSortChange?: (sort: TableSort) => void;
  selectionMode?: 'none' | 'multiple';
  selected?: RowSelection;
  onSelectionChange?: (selection: RowSelection) => void;
  onRowAction?: (id: string) => void;
  /** Rows that cannot be selected (they stay openable); the checkbox of such a row is disabled. */
  disabledIds?: ReadonlySet<string>;
  /** One row can be highlighted as the object currently open in an inspector. */
  activeId?: string;
  isLoading?: boolean;
  /** Skeleton rows drawn while `isLoading` (same height and columns as data rows, so nothing shifts). Default 5. */
  loadingRows?: number;
  /** Shown instead of the rows when `rows` is empty; use EmptyState. */
  emptyState?: ReactNode;
  /** Narrow screens only. `compact` draws a list row (title, one meta line, optional trailing status, divider) instead of a card with label: value pairs; wide screens are unchanged. */
  density?: 'default' | 'compact';
  /** Wide screens: drop the table's own border and surface when it sits inside a Panel (no box in a box). */
  flush?: boolean;
  /** Wide screens: `tall` (56 px) for two-line cells (title plus excerpt), identical for skeleton and data rows. */
  rowHeight?: 'default' | 'tall';
};

const SELECT_COLUMN_WIDTH = 52;
const SKELETON_ROWS = 5;
const SKELETON_CARDS = 3;
const SKELETON_WIDTHS = [64, 48, 72, 40] as const;
const NARROW = '(max-width: 859px)';

function toSelection(keys: Selection): RowSelection {
  return keys === 'all' ? 'all' : new Set([...keys].map(String));
}

export function DataTable<T>(props: Props<T>) {
  const narrow = useMediaQuery(NARROW);
  // The locale makes React Aria's own strings (selection checkboxes, sort announcements) Russian.
  return <I18nProvider locale="ru-RU">{narrow ? <CardList {...props} /> : <Grid {...props} />}</I18nProvider>;
}

function Grid<T>({
  columns,
  rows,
  getRowId,
  getRowText,
  sort,
  onSortChange,
  selectionMode = 'none',
  selected,
  onSelectionChange,
  onRowAction,
  disabledIds,
  activeId,
  isLoading,
  loadingRows: loadingCount = SKELETON_ROWS,
  emptyState,
  flush,
  rowHeight,
  ...rest
}: Props<T>) {
  const descriptor: SortDescriptor | undefined = sort ? { column: sort.column, direction: sort.direction } : undefined;
  const loadingRows = useMemo(
    () => Array.from({ length: loadingCount }, (_, index) => ({ id: `skeleton-${index}` })),
    [loadingCount]
  );
  return (
    <div
      className={styles.wrap}
      data-flush={flush || undefined}
      data-rows={rowHeight}
      aria-busy={isLoading || undefined}
    >
      <Table
        aria-label={rest['aria-label']}
        className={styles.table}
        selectionMode={selectionMode}
        selectedKeys={selected as Selection | undefined}
        disabledKeys={disabledIds}
        disabledBehavior="selection"
        onSelectionChange={(keys) => onSelectionChange?.(toSelection(keys))}
        sortDescriptor={descriptor}
        onSortChange={(next) => onSortChange?.({ column: String(next.column), direction: next.direction })}
        onRowAction={onRowAction ? (key) => onRowAction(String(key)) : undefined}
      >
        <TableHeader className={styles.head}>
          {selectionMode === 'multiple' ? (
            <Column className={styles.selectCell} style={{ width: SELECT_COLUMN_WIDTH }}>
              <Checkbox slot="selection" />
            </Column>
          ) : null}
          <Collection items={columns}>
            {(column) => (
              <Column
                id={column.id}
                isRowHeader={column.isRowHeader}
                allowsSorting={column.allowsSorting}
                className={styles.column}
                data-align={column.align}
                {...(column.width === undefined ? {} : { style: { width: column.width } })}
              >
                {({ allowsSorting, sortDirection }) => (
                  <span className={styles.columnInner}>
                    {column.header}
                    {allowsSorting ? (
                      <Icon
                        name={sortDirection === 'ascending' ? 'arrow-up' : 'arrow-down'}
                        size={14}
                        className={sortDirection ? styles.sortActive : styles.sortIdle}
                      />
                    ) : null}
                    {column.headerControl ?? null}
                  </span>
                )}
              </Column>
            )}
          </Collection>
        </TableHeader>
        <TableBody renderEmptyState={() => <div className={styles.empty}>{emptyState ?? ru.ui.emptyTable}</div>}>
          {isLoading
            ? loadingRows.map((row) => (
                <Row key={row.id} id={row.id} className={styles.row}>
                  {selectionMode === 'multiple' ? <Cell className={styles.cell} /> : null}
                  {columns.map((column, index) => (
                    <Cell key={column.id} className={styles.cell}>
                      <Skeleton height={12} width={`${SKELETON_WIDTHS[index % SKELETON_WIDTHS.length]}%`} />
                    </Cell>
                  ))}
                </Row>
              ))
            : rows.map((row) => (
                <Row
                  key={getRowId(row)}
                  id={getRowId(row)}
                  {...(getRowText ? { textValue: getRowText(row) } : {})}
                  className={onRowAction ? `${styles.row} ${styles.actionRow}` : styles.row}
                  data-active={activeId === getRowId(row) || undefined}
                >
                  {selectionMode === 'multiple' ? (
                    <Cell className={styles.selectCell}>
                      <Checkbox slot="selection" />
                    </Cell>
                  ) : null}
                  {columns.map((column) => (
                    <Cell key={column.id} className={styles.cell} data-align={column.align}>
                      {column.cell(row)}
                    </Cell>
                  ))}
                </Row>
              ))}
        </TableBody>
      </Table>
    </div>
  );
}

function CardList<T>({
  columns,
  rows,
  getRowId,
  sort,
  onSortChange,
  selectionMode = 'none',
  selected,
  onSelectionChange,
  onRowAction,
  activeId,
  isLoading,
  loadingRows: loadingCount,
  emptyState,
  density = 'default',
  ...rest
}: Props<T>) {
  const compact = density === 'compact';
  const titleColumn = columns.find((column) => column.isRowHeader) ?? columns[0];
  const trailingColumn = compact ? columns.find((column) => column.compactSlot === 'trailing') : undefined;
  const detailColumns = columns.filter((column) => column !== titleColumn && column !== trailingColumn);
  const sortable = columns.filter((column) => column.allowsSorting);
  const sortOptions = sortable.flatMap((column) => [
    { id: `${column.id}:ascending`, label: `${column.header}, ${ru.ui.sortAsc}` },
    { id: `${column.id}:descending`, label: `${column.header}, ${ru.ui.sortDesc}` }
  ]);
  const isSelected = (id: string) => selected === 'all' || (selected !== undefined && selected.has(id));
  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected === 'all' ? rows.map(getRowId) : selected);
    if (on) next.add(id);
    else next.delete(id);
    onSelectionChange?.(next);
  };

  return (
    <div className={styles.cards} data-density={density} aria-busy={isLoading || undefined}>
      {sortable.length > 0 && sort && onSortChange ? (
        <Select
          label={ru.ui.sortBy}
          options={sortOptions}
          value={`${sort.column}:${sort.direction}`}
          onChange={(id) => {
            const [column, direction] = id.split(':') as [string, TableSort['direction']];
            onSortChange({ column, direction });
          }}
        />
      ) : null}
      {isLoading ? (
        <ul className={styles.list} aria-label={rest['aria-label']}>
          {Array.from({ length: loadingCount ?? SKELETON_CARDS }, (_, index) => (
            <li key={index} className={styles.card}>
              <div className={styles.cardHead}>
                <div className={styles.cardTitle}>
                  {/* An actionable title is a button with a minimum target height; a plain one is a line of text. */}
                  {titleColumn?.skeleton ?? (
                    <Skeleton
                      height={onRowAction ? (compact ? 'var(--size-target-min)' : 'var(--size-target)') : '1lh'}
                      width="60%"
                    />
                  )}
                </div>
                {trailingColumn ? <Skeleton height={22} width={88} radius="var(--radius-pill)" /> : null}
              </div>
              {/* The same label: value lines the data card has, so the list keeps its height. */}
              <dl className={styles.details}>
                {detailColumns.map((column) => (
                  <div key={column.id} className={styles.detail}>
                    <Skeleton height="1lh" width="30%" />
                    <Skeleton height="1lh" width="20%" />
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <div className={styles.empty}>{emptyState ?? ru.ui.emptyTable}</div>
      ) : (
        <ul className={styles.list} aria-label={rest['aria-label']}>
          {rows.map((row) => {
            const id = getRowId(row);
            const title = titleColumn?.cell(row);
            return (
              <li
                key={id}
                className={styles.card}
                data-selected={isSelected(id) || undefined}
                data-active={activeId === id || undefined}
              >
                <div className={styles.cardHead}>
                  {selectionMode === 'multiple' ? (
                    <Checkbox
                      aria-label={ru.ui.selectRow}
                      isSelected={isSelected(id)}
                      onChange={(on) => toggle(id, on)}
                    />
                  ) : null}
                  {onRowAction ? (
                    <button type="button" className={styles.cardAction} onClick={() => onRowAction(id)}>
                      {title}
                    </button>
                  ) : (
                    <div className={styles.cardTitle}>{title}</div>
                  )}
                  {trailingColumn ? <div className={styles.trailing}>{trailingColumn.cell(row)}</div> : null}
                </div>
                <dl className={styles.details}>
                  {detailColumns.map((column) => (
                    <div key={column.id} className={styles.detail}>
                      <dt>{column.header}</dt>
                      <dd>{column.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
