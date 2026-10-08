import { Link } from '@tanstack/react-router';
import { BASE } from './proto-kit';
import { SCREENS } from './registry';
import styles from './ProtoIndex.module.css';

export const toSearch = (query: string) => Object.fromEntries(new URLSearchParams(query));

export function ProtoIndex() {
  return (
    <main className={styles.page}>
      <h1>Прототип ALEXEEV Studio</h1>
      <p className={styles.lead}>
        Кликабельный прототип на тестовых данных: сеть не используется, ничего не сохраняется. Состояния экрана
        переключаются плавающей кнопкой «Состояние» или ссылками ниже. Обычная работа начинается с{' '}
        <Link to={BASE as never}>Обзора</Link>.
      </p>
      {SCREENS.map((screen) => (
        <section key={screen.id} className={styles.group}>
          <h2>
            <Link to={`${BASE}${screen.path ? `/${screen.path}` : ''}` as never}>{screen.label}</Link>
          </h2>
          <ul>
            {screen.states.map((state) => (
              <li key={state.id}>
                <Link
                  to={`${BASE}${screen.path ? `/${screen.path}` : ''}` as never}
                  search={toSearch(state.query) as never}
                >
                  {state.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
