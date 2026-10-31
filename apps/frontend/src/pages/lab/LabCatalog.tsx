import { useState } from 'react';
import { groupByDay } from '../../shared/lib/group-by-day';
import {
  Button,
  DetailRow,
  DetailSection,
  DetailSheet,
  EmptyState,
  GroupedList,
  ListRow,
  ListRowSkeleton,
  Menu,
  PageHeader,
  Panel,
  PanelList,
  StatGrid,
  StatTile,
  StatusPill,
  Switch,
  Track,
  VisuallyHidden
} from '../../shared/ui';
import { Icon } from '../../shared/ui/Icon';
import styles from './LabCatalog.module.css';

const MENU = [
  { id: 'edit', label: 'Изменить' },
  { id: 'skip', label: 'Пропустить' }
] as const;

const DAY = 86_400_000;

/** Phase 0 primitives in every state, on invented data. Shown at the end of «Редкие состояния». */
export function LabCatalog() {
  const [sheet, setSheet] = useState(false);
  const [on, setOn] = useState(true);
  const [now] = useState(() => Date.now());
  const events = [0, 0, 1, 3].map((days, index) => ({ id: index, at: now + days * DAY + index * 3_600_000 }));
  const days = groupByDay(events, (event) => event.at, 'Europe/Moscow');
  return (
    <div className={styles.catalog}>
      <h2 className={styles.heading}>Каталог: примитивы фазы 0</h2>

      <Panel title="ListRow: состояния">
        <PanelList aria-label="Состояния строки">
          <ListRow
            title="По умолчанию"
            leading="09:00"
            meta="Канал · 3 фото"
            status={<StatusPill label="Ждёт" group="pending" icon="clock" />}
          />
          <ListRow
            title="Нажимаемая, с маркерами и переключателем"
            leading="12:30"
            meta="Рубрика · Герой дня"
            markers={<Icon name="image" size={16} />}
            onPress={() => undefined}
            trailing={
              <Switch aria-label="Включить слот" isSelected={on} onChange={setOn}>
                <VisuallyHidden>Включить слот</VisuallyHidden>
              </Switch>
            }
          />
          <ListRow title="Выбранная" leading="15:00" meta="isActive" isActive onPress={() => undefined} />
          <ListRow title="Приглушённая" leading="16:00" meta="isDimmed" isDimmed onPress={() => undefined} />
          <ListRow title="Недоступная" leading="17:00" meta="isDisabled" isDisabled />
          <ListRow
            title="Плотная, с меню"
            density="compact"
            leading="18:00"
            trailing={<Menu label="Действия строки" items={MENU} />}
          />
          <ListRow
            title="Очень длинное название строки, которое не помещается в одну линию на телефоне и обрезается на десктопе"
            meta="Длинная мета-строка тоже обрезается многоточием, а не ломает ширину"
            status={<StatusPill label="Ошибка" group="failed" icon="alert" />}
            onPress={() => undefined}
          />
          <ListRowSkeleton />
          <ListRowSkeleton density="compact" />
        </PanelList>
      </Panel>

      <Panel title="GroupedList: сворачиваемые группы">
        <GroupedList
          collapsible
          stickyHeaders={false}
          groups={[
            { id: 'a', label: 'Новости', count: 2, hint: 'раз в день' },
            { id: 'b', label: 'Свёрнутая группа', count: 1, defaultOpen: false }
          ]}
        >
          {(id) => (
            <PanelList aria-label={id}>
              <ListRow title={`Строка группы ${id}`} meta="Мета" onPress={() => undefined} />
            </PanelList>
          )}
        </GroupedList>
      </Panel>

      <Panel title="GroupedList: дни (chip на телефоне), groupByDay">
        <GroupedList
          variant="chip"
          stickyHeaders={false}
          groups={days.map((day) => ({ id: day.key, label: day.label, count: day.items.length }))}
        >
          {(id) => (
            <PanelList aria-label={id}>
              {(days.find((day) => day.key === id)?.items ?? []).map((event) => (
                <ListRow key={event.id} title={`Событие ${event.id + 1}`} leading="10:00" />
              ))}
            </PanelList>
          )}
        </GroupedList>
      </Panel>

      <div className={styles.block}>
        <PageHeader
          title="Очень длинный заголовок страницы, который переносится"
          description="Описание на всю ширину; главная кнопка на телефоне занимает свою строку."
          tools={null}
          primaryAction={<Button variant="primary">Создать публикацию</Button>}
          secondaryActions={<Menu label="Ещё действия" items={MENU} />}
        />
      </div>

      <Panel title="EmptyState: compact">
        <EmptyState
          size="compact"
          icon="calendar"
          title="Пока пусто"
          hint="Здесь появятся слоты, как только планировщик их соберёт."
          action={<Button variant="secondary">Создать</Button>}
        />
      </Panel>
      <Panel title="EmptyState: compact без кнопки">
        <EmptyState size="compact" title="Нет данных" />
      </Panel>

      <Panel title="Track: 2 строки в узкой колонке, 1 строка в широкой">
        <div className={styles.tracks}>
          <Track label="Рубрика с длинным названием" value="12 · 40%" share={40} />
          <Track label="Пустая" value="0" share={0} />
          <Track label="Полная" value="30 · 100%" share={100} />
        </div>
      </Panel>

      <Panel title="No card in card: StatTile и Panel flat внутри Panel">
        <div className={styles.inner}>
          <StatGrid columns="two">
            <StatTile label="Опубликовано" value="128" meta="за 30 дней" />
            <StatTile label="Ошибок" value="3" meta="2,3%" />
          </StatGrid>
          <Panel variant="flat" title="Плоская панель">
            <p className={styles.note}>Без рамки и фона: только линия сверху и отступ.</p>
          </Panel>
        </div>
      </Panel>

      <div className={styles.block}>
        <Button variant="secondary" onPress={() => setSheet(true)}>
          Открыть DetailSheet
        </Button>
        <DetailSheet
          isOpen={sheet}
          onOpenChange={setSheet}
          title="Слот 09:00"
          subtitle="Понедельник, 3 ноября"
          status={<StatusPill label="Ждёт" group="pending" icon="clock" />}
          footer={
            <>
              <Button variant="primary">Подтвердить</Button>
              <Button variant="secondary" onPress={() => setSheet(false)}>
                Закрыть
              </Button>
            </>
          }
        >
          <DetailSection label="Рубрика">
            <DetailRow label="Название">Герой дня</DetailRow>
            <DetailRow label="Канал">Dota 2: новости</DetailRow>
          </DetailSection>
          <DetailSection label="Публикация">
            <DetailRow label="Время">09:00</DetailRow>
            <DetailRow label="Статус">Ждёт публикации</DetailRow>
          </DetailSection>
        </DetailSheet>
      </div>
    </div>
  );
}
