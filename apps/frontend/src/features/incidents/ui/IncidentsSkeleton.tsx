import { ru } from '../../../shared/lib/ru';
import {
  FilterButton,
  FooterLine,
  Panel,
  PanelList,
  PanelRow,
  PhoneToolbar,
  Select,
  Skeleton,
  Tab,
  TabList,
  Tabs,
  VisuallyHidden,
  useMediaQuery
} from '../../../shared/ui';
import { copy } from './copy';
import styles from './Incidents.module.css';

const ROWS = 5;
const noop = () => {};

/** The list rows while incidents load: the loaded geometry (badge + title, reason, meta, one action). */
export function IncidentsListSkeleton() {
  return (
    <PanelList aria-label={copy.loading}>
      {Array.from({ length: ROWS }, (_, index) => (
        <PanelRow key={index}>
          <div className={styles.skeletonRow}>
            <div className={styles.skeletonMain}>
              <div className={styles.skeletonHead}>
                <Skeleton width={96} height={22} radius="var(--radius-pill)" />
                <Skeleton width={index % 2 === 0 ? '40%' : '30%'} height={16} />
              </div>
              <Skeleton width={index % 2 === 0 ? '62%' : '48%'} height={14} />
              <Skeleton width="30%" height={12} />
            </div>
            <Skeleton width={96} height="var(--size-button)" radius="var(--radius-2)" />
          </div>
        </PanelRow>
      ))}
    </PanelList>
  );
}

/** The incidents page while loading or while the session is restored: tabs, panel and filter placeholders; no request. */
export function IncidentsSkeleton() {
  const narrow = useMediaQuery('(max-width: 859px)');
  return (
    <div className={styles.page} aria-busy="true">
      <VisuallyHidden>
        <output>{ru.shell.loadingPage}</output>
      </VisuallyHidden>
      <Tabs selectedKey="open" isDisabled>
        <TabList aria-label={copy.filters.state}>
          <Tab id="open">{copy.filters.open}</Tab>
          <Tab id="resolved">{copy.filters.resolved}</Tab>
        </TabList>
      </Tabs>
      <Panel title={copy.panel.open} reserveRows={ROWS} footer={<FooterLine text={copy.loading} />}>
        {narrow ? (
          <PhoneToolbar>
            <FilterButton count={0} isDisabled onPress={noop} />
          </PhoneToolbar>
        ) : (
          <div className={styles.toolbar}>
            <Select
              inlineLabel
              label={copy.filters.kind}
              options={[{ id: 'all', label: copy.filters.all }]}
              value="all"
              onChange={noop}
              isDisabled
            />
          </div>
        )}
        <IncidentsListSkeleton />
      </Panel>
    </div>
  );
}
