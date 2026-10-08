import { useState } from 'react';
import {
  Button,
  Disclosure,
  EmptyState,
  ErrorState,
  IconButton,
  Menu,
  PageHeader,
  Panel,
  PanelList,
  PanelRow,
  Select,
  Skeleton,
  StatusBadge,
  Tab,
  TabList,
  Tabs,
  useToast
} from '../../shared/ui';
import { formatDateTime, type Incident } from './data';
import { channelName, shortChannel } from './parts';
import { useNarrow, useProtoNavigate, useProtoSearch, useProtoSearchUpdate, useScreenPhase } from './proto-kit';
import { useProtoStore } from './proto-store';
import styles from './Proto.module.css';
import rows from './Rows.module.css';

const TYPES = [
  { id: 'all', label: 'Все' },
  { id: 'unknown', label: 'Требуют проверки' },
  { id: 'failed', label: 'Ошибки' }
];

export function IncidentsScreen() {
  const narrow = useNarrow();
  const { phase, retry } = useScreenPhase();
  const view = useProtoSearch().view === 'closed' ? 'closed' : 'open';
  const update = useProtoSearchUpdate();
  const go = useProtoNavigate();
  const toast = useToast();
  const { incidents, publications, posts, channels, closeIncident } = useProtoStore();
  const [type, setType] = useState('all');

  const list = incidents.filter((i) => i.open === (view === 'open') && (type === 'all' || i.kind === type));
  const openCount = incidents.filter((i) => i.open).length;
  const empty = phase === 'empty' || list.length === 0;

  const open = (incident: Incident) => go('publications', { view: 'errors', id: incident.publicationId });

  const renderRow = (incident: Incident) => {
    const pub = publications.find((p) => p.id === incident.publicationId);
    const post = posts.find((p) => p.id === pub?.postId);
    const status = pub?.status ?? 'failed';
    const meta = `${shortChannel(channelName(channels, pub?.channelId ?? ''))} · ${formatDateTime(incident.at)}`;
    const primary =
      incident.kind === 'unknown' ? (
        <Button onPress={() => open(incident)}>Проверить</Button>
      ) : (
        <Button variant="secondary" onPress={() => open(incident)}>
          Открыть
        </Button>
      );
    const close = () => {
      closeIncident(incident.id);
      toast.show({ tone: 'success', title: 'Инцидент закрыт' });
    };
    return (
      <PanelRow key={incident.id}>
        <div className={rows.incident}>
          <div className={rows.incidentMain}>
            <div className={rows.incidentHead}>
              <StatusBadge status={status} />
              <strong className={rows.incidentTitle}>{post?.title ?? 'Пост удалён'}</strong>
            </div>
            <p className={rows.reason}>{incident.reason}</p>
            <span className={rows.meta}>{meta}</span>
            <Disclosure id={`d-${incident.id}`} title="Детали">
              <div className={rows.detail}>
                <code>{incident.code}</code>
                <IconButton
                  size="sm"
                  label="Копировать код"
                  icon="link"
                  onPress={() => toast.show({ tone: 'info', title: 'Код скопирован' })}
                />
              </div>
            </Disclosure>
          </div>
          {incident.open ? (
            <div className={rows.incidentActions}>
              {primary}
              {incident.kind === 'failed' && !narrow ? (
                <Button variant="ghost" onPress={close}>
                  Закрыть
                </Button>
              ) : null}
              {incident.kind === 'failed' && narrow ? (
                <Menu
                  label="Другие действия"
                  items={[{ id: 'close', label: 'Закрыть инцидент', icon: 'check-circle' }]}
                  onAction={close}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </PanelRow>
    );
  };

  let body;
  if (phase === 'loading') {
    body = (
      <PanelList aria-label="Загрузка инцидентов">
        {Array.from({ length: 4 }, (_, index) => (
          <PanelRow key={index}>
            <div className={rows.incident}>
              <div className={rows.incidentMain}>
                <Skeleton height={22} width={150} radius="var(--radius-pill)" />
                <Skeleton height={14} width="70%" />
                <Skeleton height={12} width="40%" />
              </div>
            </div>
          </PanelRow>
        ))}
      </PanelList>
    );
  } else if (phase === 'error') {
    body = <ErrorState message="Не удалось загрузить инциденты." requestId="req_c7714ee0" onRetry={retry} />;
  } else if (empty) {
    body = (
      <EmptyState
        icon={view === 'open' ? 'check-circle' : 'clock'}
        title={view === 'open' ? 'Всё под контролем' : 'История пуста'}
        description={view === 'open' ? 'Открытых инцидентов нет.' : 'Закрытые инциденты появятся здесь.'}
      />
    );
  } else {
    body = <PanelList aria-label="Инциденты">{list.map(renderRow)}</PanelList>;
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Инциденты" />
      <Tabs selectedKey={view} onSelectionChange={(key) => update({ view: key === 'open' ? undefined : String(key) })}>
        <TabList aria-label="Состояние инцидентов">
          <Tab id="open">
            Открытые <span className="tab-count">{openCount}</span>
          </Tab>
          <Tab id="closed">Закрытые</Tab>
        </TabList>
      </Tabs>
      <Panel
        title={view === 'open' ? 'Открытые инциденты' : 'Закрытые инциденты'}
        reserveRows={phase === 'ready' && !empty ? undefined : 5}
      >
        <div className={styles.toolbarRow} data-narrow={narrow || undefined}>
          <Select
            inlineLabel
            label="Тип"
            options={TYPES}
            value={type}
            onChange={setType}
            isDisabled={phase === 'loading'}
          />
        </div>
        {body}
      </Panel>
    </div>
  );
}
