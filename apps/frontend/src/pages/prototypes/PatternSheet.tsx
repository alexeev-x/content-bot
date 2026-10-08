import { useState } from 'react';
import {
  Button,
  Panel,
  PanelList,
  RowCard,
  SegmentedControl,
  StatusBadge,
  Tab,
  TabList,
  Tabs,
  PageHeader,
  Menu,
  type StatusKey
} from '../../shared/ui';
import { FilterButton, PhoneSkeletonRows } from './parts';
import styles from './Patterns.module.css';

const STATUSES: StatusKey[] = [
  'draft',
  'approved',
  'scheduled',
  'queued',
  'preparing',
  'sending',
  'sent',
  'retry_wait',
  'failed',
  'unknown',
  'cancelled'
];

const SAMPLE = [
  {
    title: 'Патч 7.37d: что изменилось в балансе героев и почему это важно для всех ролей',
    status: 'scheduled' as const,
    meta: '8 окт., 12:00 · Official RU'
  },
  {
    title: 'Герой дня: Muerta',
    status: 'unknown' as const,
    meta: '7 окт., 14:30 · Official RU',
    warning: 'Проверьте канал'
  },
  { title: 'Новый сундук и наборы TI', status: 'sent' as const, meta: '7 окт., 22:40 · Official RU' }
];

function Block({ title, rule, children }: { title: string; rule: string; children: React.ReactNode }) {
  return (
    <section className={styles.block}>
      <header className={styles.blockHead}>
        <h2>{title}</h2>
        <p>{rule}</p>
      </header>
      {children}
    </section>
  );
}

export function PatternSheet() {
  const [mode, setMode] = useState('dark');
  return (
    <div className={styles.page}>
      <PageHeader title="Паттерны" />
      <Block
        title="Три контроля, три задачи"
        rule="Вкладки: разные виды одной коллекции (в URL). Переключатель: режим одного вида, применяется сразу. Фильтры: сужают список внутри вида."
      >
        <div className={styles.triple}>
          <div>
            <h3>Вкладки</h3>
            <Tabs>
              <TabList aria-label="Пример вкладок">
                <Tab id="a">Все</Tab>
                <Tab id="b">Черновики</Tab>
                <Tab id="c">
                  Архив <span className="tab-count">3</span>
                </Tab>
              </TabList>
            </Tabs>
          </div>
          <div>
            <h3>Переключатель</h3>
            <SegmentedControl
              label="Пример переключателя"
              value={mode}
              onChange={setMode}
              options={[
                { id: 'light', label: 'Светлая' },
                { id: 'dark', label: 'Тёмная' },
                { id: 'system', label: 'Системная' }
              ]}
            />
          </div>
          <div>
            <h3>Фильтры</h3>
            <FilterButton count={2} onPress={() => undefined} />
          </div>
        </div>
      </Block>
      <Block
        title="Панель и её шапка"
        rule="Список всегда в панели: шапка 48 px, строки, нижняя строка (счётчик и «Показать ещё») зарезервирована."
      >
        <Panel
          title="Все публикации"
          action={<span className={styles.note}>Europe/Chisinau, UTC+3</span>}
          footer={
            <>
              <span>Загружено 3 из 10</span>
              <Button variant="ghost" size="sm">
                Показать ещё
              </Button>
            </>
          }
        >
          <PanelList aria-label="Пример строк">
            {SAMPLE.map((row) => (
              <RowCard
                key={row.title}
                title={row.title}
                status={<StatusBadge status={row.status} />}
                meta={row.meta}
                {...('warning' in row ? { warning: row.warning } : {})}
                menu={<Menu label="Действия" items={[{ id: 'open', label: 'Открыть' }]} />}
              />
            ))}
          </PanelList>
        </Panel>
      </Block>
      <Block title="Статусы" rule="Иконка и текст вместе: цвет никогда не единственный сигнал.">
        <div className={styles.badges}>
          {STATUSES.map((status) => (
            <StatusBadge key={status} status={status} />
          ))}
        </div>
      </Block>
      <Block
        title="Геометрия скелетона"
        rule="Слева данные, посередине скелетон, справа скелетон поверх данных на тех же координатах: высота строки и положение чипа совпадают."
      >
        <div className={styles.geometry}>
          {(['data', 'skeleton', 'overlay'] as const).map((kind) => (
            <div key={kind} className={styles.geometryCol}>
              <h3>{kind === 'data' ? 'Данные' : kind === 'skeleton' ? 'Скелетон' : 'Наложение'}</h3>
              <Panel title="Посты">
                <div className={styles.overlayBox}>
                  {kind !== 'skeleton' ? (
                    <PanelList aria-label="Данные">
                      {SAMPLE.map((row) => (
                        <RowCard
                          key={row.title}
                          title={row.title.slice(0, 40)}
                          status={<StatusBadge status={row.status} />}
                          meta={row.meta}
                        />
                      ))}
                    </PanelList>
                  ) : null}
                  {kind !== 'data' ? (
                    <div className={kind === 'overlay' ? styles.overlayTop : undefined}>
                      <PhoneSkeletonRows count={3} label="Скелетон" />
                    </div>
                  ) : null}
                </div>
              </Panel>
            </div>
          ))}
        </div>
      </Block>
    </div>
  );
}
