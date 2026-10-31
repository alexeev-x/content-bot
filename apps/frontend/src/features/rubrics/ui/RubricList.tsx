import { RUBRIC_TITLES, type RubricItemDto } from '@alexeev/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../shared/api/http-client';
import {
  Disclosure,
  EmptyState,
  ErrorState,
  GroupedList,
  Icon,
  ListRow,
  ListRowSkeleton,
  Panel,
  PanelList,
  SearchField,
  SegmentedControl,
  Switch,
  VisuallyHidden
} from '../../../shared/ui';
import { rubricListQueryOptions } from '../api/rubrics-queries';
import { mskDay } from '../model/msk';
import {
  blockedItems,
  countByFilter,
  groupOf,
  matchesFilter,
  relativeDay,
  type RubricFilter,
  type RubricGroupId
} from '../model/rubric-filter';
import { useRubricSave } from '../model/use-rubric-save';
import { rubricsCopy as copy } from './copy';
import { listCopy } from './list-copy';
import styles from './RubricList.module.css';
import { RubricDetail } from './RubricDetail';
import { RubricState } from './RubricState';

const GROUP_ORDER: readonly RubricGroupId[] = ['active', 'attention', 'waiting', 'off'];
const FILTERS: readonly RubricFilter[] = ['all', 'active', 'off', 'attention'];

function metaOf(item: RubricItemDto, today: string): string {
  const last =
    item.lastPostAt === null || item.lastPostSeeded
      ? listCopy.never
      : listCopy.last(relativeDay(item.lastPostAt, today));
  return item.next === null ? last : `${last} · ${listCopy.next(relativeDay(item.next.at, today))}`;
}

/** One row: the switch is its own control, the rest of the row opens the drawer. */
function RubricRow({ item, today, onOpen }: { item: RubricItemDto; today: string; onOpen: () => void }) {
  const { save, isPending } = useRubricSave(item);
  const title = RUBRIC_TITLES[item.key];
  const markers =
    item.hasPicture || item.hasPoll ? (
      <>
        {item.hasPicture ? (
          <span>
            <Icon name="image" size={16} />
            <VisuallyHidden>{listCopy.withPicture}</VisuallyHidden>
          </span>
        ) : null}
        {item.hasPoll ? (
          <span>
            <Icon name="chart" size={16} />
            <VisuallyHidden>{listCopy.withPoll}</VisuallyHidden>
          </span>
        ) : null}
      </>
    ) : undefined;
  return (
    <ListRow
      title={title}
      meta={metaOf(item, today)}
      markers={markers}
      status={<RubricState state={item.state} />}
      isDimmed={!item.enabled}
      onPress={onOpen}
      trailing={
        <Switch
          aria-label={listCopy.switchLabel(title)}
          isSelected={item.enabled}
          isDisabled={isPending}
          onChange={(enabled) => save({ enabled })}
        >
          <VisuallyHidden>{listCopy.switchLabel(title)}</VisuallyHidden>
        </Switch>
      }
    />
  );
}

/** «Рубрики» → Рубрики: every rubric with its state, last and next post and the on/off switch; a row opens its drawer. */
export function RubricList() {
  const list = useQuery(rubricListQueryOptions());
  // Taken once per mount, like the calendar: «today» as it was when the page opened.
  const [today] = useState(() => mskDay(new Date().toISOString()));
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<RubricFilter>('all');
  const [openKey, setOpenKey] = useState<RubricItemDto['key'] | null>(null);
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
  const items = list.data.items;
  const counts = countByFilter(items);
  const needle = query.trim().toLowerCase();
  const shown = items.filter(
    (item) => matchesFilter(item, filter) && RUBRIC_TITLES[item.key].toLowerCase().includes(needle)
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
            {(id) => (
              <PanelList aria-label={listCopy.groups[id as RubricGroupId]}>
                {groups
                  .find((group) => group.id === id)
                  ?.rows.map((item) => (
                    <RubricRow key={item.key} item={item} today={today} onOpen={() => setOpenKey(item.key)} />
                  ))}
              </PanelList>
            )}
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
      {opened === undefined ? null : <RubricDetail key={opened.key} item={opened} onClose={() => setOpenKey(null)} />}
    </div>
  );
}
