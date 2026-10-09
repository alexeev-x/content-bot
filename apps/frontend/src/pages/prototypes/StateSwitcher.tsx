import { Link } from '@tanstack/react-router';
import { Button, Popover, Switch } from '../../shared/ui';
import { BASE, useProtoPath, useProtoSearch } from './proto-kit';
import { useProtoStore } from './proto-store';
import { toSearch } from './ProtoIndex';
import { screenOf } from './registry';
import styles from './StateSwitcher.module.css';

/** Dev-only floating panel: forces a state of the current screen and flips global conditions. */
export function StateSwitcher() {
  const path = useProtoPath();
  const search = useProtoSearch();
  const { botProblem, setBotProblem, offline, setOffline } = useProtoStore();
  const screen = screenOf(path);
  const here = `${BASE}${path ? `/${path}` : ''}`;
  const mini = search.mini === '1';
  return (
    <div className={styles.dock} data-editor={path.startsWith('posts/') || undefined}>
      <Popover
        label="Состояние прототипа"
        placement="bottom end"
        trigger={
          <Button variant="secondary" icon="settings" className={styles.trigger} aria-label="Состояние прототипа" />
        }
      >
        <div className={styles.panel}>
          {screen ? (
            <section>
              <h2>Экран: {screen.label}</h2>
              <ul className={styles.states}>
                {screen.states.map((state) => (
                  <li key={state.id}>
                    <Link
                      to={here as never}
                      search={{ ...toSearch(state.query), ...(mini ? { mini: '1' } : {}) } as never}
                    >
                      {state.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section className={styles.switches}>
            <h2>Везде</h2>
            <Switch isSelected={botProblem} onChange={setBotProblem}>
              Проблема с ботом
            </Switch>
            <Switch isSelected={offline} onChange={setOffline}>
              Нет соединения
            </Switch>
            <Link to={here as never} search={{ ...search, mini: mini ? undefined : '1' } as never}>
              {mini ? 'Выйти из режима Mini App' : 'Открыть как Mini App'}
            </Link>
          </section>
          <Link to={`${BASE}/index` as never}>Все экраны и состояния</Link>
        </div>
      </Popover>
    </div>
  );
}
