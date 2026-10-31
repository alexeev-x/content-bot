import { RUBRIC_TITLES, type RubricItemDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import {
  Disclosure,
  EmptyState,
  ErrorState,
  GroupedList,
  Select,
  ListRow,
  ListRowSkeleton,
  Panel,
  PanelList,
  SearchField,
  SegmentedControl,
  useMediaQuery
} from '../../../shared/ui';
import { rubricListQueryOptions } from '../api/rubrics-queries';
import { mskDay } from '../model/msk';
import {
  blockedItems,
  countByFilter,
  groupOf,
  matchesFilter,
  isListedRubric,
  sortRubrics,
  type RubricFilter,
  type RubricGroupId,
  type RubricSort
} from '../model/rubric-filter';
import { rubricsCopy as copy } from './copy';
import { listCopy } from './list-copy';
import styles from './RubricList.module.css';
import { RubricDetail } from './RubricDetail';
import { RubricState } from './RubricState';
import { FormatIcons, RubricSwitch, RubricTable, isException, nextText, restUntilText } from './RubricTable';

const GROUP_ORDER: readonly RubricGroupId[] = ['active', 'attention', 'waiting', 'off'];
const FILTERS: readonly RubricFilter[] = ['all', 'active', 'off', 'attention'];
const SORTS: readonly RubricSort[] = ['next', 'title', 'stale'];

/** Phone row (52 px): name and format icons, one muted line, the switch at the end. */
function RubricRow({ item, today, onOpen }: { item: RubricItemDto; today: string; onOpen: () => void }) {
  return (
    <ListRow
      title={RUBRIC_TITLES[item.key]}
      meta={item.next === null ? (restUntilText(item, today) ?? listCopy.dash) : nextText(item, today)}
      markers={item.hasPicture || item.hasPoll ? <FormatIcons item={item} /> : undefined}
      status={isException(item) ? <RubricState state={item.state} /> : undefined}
      isDimmed={!item.enabled}
      onPress={onOpen}
      trailing={<RubricSwitch item={item} />}
    />
  );
}

/** «Рубрики» → Рубрики: every rubric with its state, last and next post and the on/off switch; a row opens its drawer. */
type Props = {
  /** The rubric whose drawer is open: owned by the section so the calendar can open one (optional). */
  openKey?: RubricItemDto['key'] | null;
  onOpenKeyChange?: (key: RubricItemDto['key'] | null) => void;
  /** Switches the page to the analytics tab (the rubric drawer's link). */
  onOpenAnalytics?: () => void;
};

export function RubricList({ openKey: controlledKey, onOpenKeyChange, onOpenAnalytics }: Props = {}) {
  const list = useQuery(rubricListQueryOptions());
  // Taken once per mount, like the calendar: «today» as it was when the page opened.
  const [today] = useState(() => mskDay(new Date().toISOString()));
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<RubricFilter>('all');
  const [sort, setSort] = useState<RubricSort>('next');
  const wide = useMediaQuery('(min-width: 860px)');
  const [ownKey, setOwnKey] = useState<RubricItemDto['key'] | null>(null);
  const openKey = controlledKey === undefined ? ownKey : controlledKey;
  const setOpenKey = (key: RubricItemDto['key'] | null) => (onOpenKeyChange ?? setOwnKey)(key);
  if (list.isPending)
    return (
      <Panel title={copy.list.caption}>
        <PanelList>
          {[0, 1, 2, 3, 4].map((index) => (
            <ListRowSkeleton key={index} withLeading={false} />
          ))}
        </PanelList>
      </Panel>
    );
  if (list.isError)
    return (
      <ErrorState
        message={copy.loadError}
        requestId={list.error instanceof ApiError ? list.error.requestId : undefined}
        onRetry={() => void list.refetch()}
      />
    );
  const items = list.data.items.filter((item) => isListedRubric(item.key));
  const counts = countByFilter(items);
  const needle = query.trim().toLowerCase();
  const shown = sortRubrics(
    items.filter((item) => matchesFilter(item, filter) && RUBRIC_TITLES[item.key].toLowerCase().includes(needle)),
    sort,
    (item) => RUBRIC_TITLES[item.key]
  );
  const groups = GROUP_ORDER.map((id) => ({
    id,
    rows: shown.filter((item) => groupOf(item) === id)
  })).filter((group) => group.rows.length > 0);
  const blocked = blockedItems(items);
  // Read live from the query: the drawer shows the revision a save just returned.
  const opened = openKey === null ? undefined : items.find((item) => item.key === openKey);
  return (
    <div className={styles.page}>
      <Panel title={copy.list.caption}>
        <div className={styles.toolbar}>
          <SearchField
            label={listCopy.search}
            placeholder={listCopy.searchPlaceholder}
            value={query}
            onChange={setQuery}
          />
          <div className={styles.chips}>
            <SegmentedControl
              label={listCopy.filterLabel}
              value={filter}
              onChange={(id) => setFilter(id as RubricFilter)}
              options={FILTERS.map((id) => ({ id, label: `${listCopy.filters[id]} ${counts[id]}` }))}
            />
          </div>
          <Select
            label={listCopy.sortLabel}
            inlineLabel
            value={sort}
            onChange={(id) => setSort(id as RubricSort)}
            options={SORTS.map((id) => ({ id, label: listCopy.sorts[id] }))}
          />
        </div>
        {groups.length === 0 ? (
          <EmptyState size="compact" icon="search" title={listCopy.noResults} hint={listCopy.noResultsHint} />
        ) : (
          <GroupedList
            collapsible
            variant="bar"
            groups={groups.map((group) => ({
              id: group.id,
              label: listCopy.groups[group.id],
              count: group.rows.length,
              defaultOpen: group.id === 'active' || group.id === 'attention' || needle !== ''
            }))}
          >
            {(id) =>
              wide ? (
                <RubricTable
                  label={listCopy.groups[id as RubricGroupId]}
                  rows={groups.find((group) => group.id === id)?.rows ?? []}
                  today={today}
                  onOpen={setOpenKey}
                />
              ) : (
                <PanelList aria-label={listCopy.groups[id as RubricGroupId]}>
                  {groups
                    .find((group) => group.id === id)
                    ?.rows.map((item) => (
                      <RubricRow key={item.key} item={item} today={today} onOpen={() => setOpenKey(item.key)} />
                    ))}
                </PanelList>
              )
            }
          </GroupedList>
        )}
      </Panel>
      {blocked.length === 0 ? null : (
        <Panel>
          <Disclosure id="blocked" title={listCopy.blocked(blocked.length)}>
            <PanelList aria-label={listCopy.blocked(blocked.length)}>
              {blocked.map((item) => (
                <ListRow
                  key={item.key}
                  density="compact"
                  title={RUBRIC_TITLES[item.key]}
                  meta={
                    item.missing.length === 0
                      ? copy.list.states[item.state]
                      : copy.missing(item.missing.map((need) => copy.needs[need]).join(', '))
                  }
                  onPress={() => setOpenKey(item.key)}
                />
              ))}
            </PanelList>
          </Disclosure>
        </Panel>
      )}
      {opened === undefined ? null : (
        <RubricDetail
          key={opened.key}
          item={opened}
          onClose={() => setOpenKey(null)}
          onOpenAnalytics={
            onOpenAnalytics === undefined
              ? undefined
              : () => {
                  setOpenKey(null);
                  onOpenAnalytics();
                }
          }
        />
      )}
    </div>
  );
}
