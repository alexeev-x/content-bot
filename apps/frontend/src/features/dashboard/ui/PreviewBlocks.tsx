import { Icon } from '../../../shared/ui';
import styles from './Dashboard.module.css';

function PreviewBadge() {
  return <span className={styles.previewBadge}>Превью</span>;
}

export function DotaPulsePreview() {
  return (
    <section className={styles.previewCard} aria-labelledby="dashboard-dota-pulse">
      <div className={styles.previewHead}>
        <div>
          <div className={styles.previewTitleLine}>
            <Icon name="zap" size={18} />
            <h2 id="dashboard-dota-pulse" className={styles.previewTitle}>Dota Pulse</h2>
            <PreviewBadge />
          </div>
          <p className={styles.previewDescription}>Будущий блок событий Dota. Сейчас показан макет данных.</p>
        </div>
      </div>
      <ul className={styles.previewList}>
        <li className={styles.previewRow}>
          <span className={styles.previewMarker}>Патч</span>
          <div><strong>Новое обновление Dota</strong><span>Официальные изменения и patch notes</span></div>
        </li>
        <li className={styles.previewRow}>
          <span className={styles.previewMarker}>Сундук</span>
          <div><strong>Новый treasure / наборы</strong><span>Сеты, герои, редкости и официальный источник</span></div>
        </li>
        <li className={styles.previewRow}>
          <span className={styles.previewMarker}>Мета</span>
          <div><strong>Изменения героев</strong><span>Winrate / pickrate после обновления</span></div>
        </li>
      </ul>
    </section>
  );
}

export function AnalyticsPreview() {
  return (
    <section className={styles.previewCard} aria-labelledby="dashboard-analytics-preview">
      <div className={styles.previewHead}>
        <div>
          <div className={styles.previewTitleLine}>
            <Icon name="arrow-up" size={18} />
            <h2 id="dashboard-analytics-preview" className={styles.previewTitle}>Аналитика канала</h2>
            <PreviewBadge />
          </div>
          <p className={styles.previewDescription}>Макет будущей Telegram-аналитики. Цифры не являются реальными данными.</p>
        </div>
      </div>
      <div className={styles.metricGrid} aria-label="Пример будущих метрик">
        <div className={styles.metric}>
          <span>Просмотры</span>
          <strong>—</strong>
          <small>После подключения метрик</small>
        </div>
        <div className={styles.metric}>
          <span>Подписчики</span>
          <strong>—</strong>
          <small>История по снапшотам</small>
        </div>
        <div className={styles.metric}>
          <span>Вовлечённость</span>
          <strong>—</strong>
          <small>Только доступные данные</small>
        </div>
      </div>
    </section>
  );
}

export function WatchlistPreview() {
  return (
    <section className={styles.previewCard} aria-labelledby="dashboard-watchlist-preview">
      <div className={styles.previewHead}>
        <div>
          <div className={styles.previewTitleLine}>
            <Icon name="search" size={18} />
            <h2 id="dashboard-watchlist-preview" className={styles.previewTitle}>Отслеживание</h2>
            <PreviewBadge />
          </div>
          <p className={styles.previewDescription}>Будущие watchlists для героев, предметов и событий.</p>
        </div>
      </div>
      <div className={styles.watchGrid}>
        <div className={styles.watchItem}><strong>Tidehunter</strong><span>Герой</span></div>
        <div className={styles.watchItem}><strong>Сундуки</strong><span>Cosmetics</span></div>
        <div className={styles.watchItem}><strong>Патчи</strong><span>События</span></div>
      </div>
    </section>
  );
}
