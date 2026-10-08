import { Icon } from '../../../shared/ui';
import { Block } from './Block';
import styles from './Dashboard.module.css';

// Static mock-ups of planned panels: they need no data, so the loading skeleton renders them as they are.

function PreviewBadge() {
  return <span className={styles.previewBadge}>Превью</span>;
}

export function DotaPulsePreview() {
  return (
    <Block title="Dota Pulse" icon={<Icon name="zap" size={16} />} marker={<PreviewBadge />}>
      <p className={styles.previewDescription}>Будущий блок событий Dota. Сейчас показан макет данных.</p>
      <ul className={styles.list}>
        <li className={styles.previewRow}>
          <span className={styles.previewMarker}>Патч</span>
          <div>
            <strong>Новое обновление Dota</strong>
            <span>Официальные изменения и patch notes</span>
          </div>
        </li>
        <li className={styles.previewRow}>
          <span className={styles.previewMarker}>Сундук</span>
          <div>
            <strong>Новый treasure / наборы</strong>
            <span>Сеты, герои, редкости и официальный источник</span>
          </div>
        </li>
        <li className={styles.previewRow}>
          <span className={styles.previewMarker}>Мета</span>
          <div>
            <strong>Изменения героев</strong>
            <span>Winrate / pickrate после обновления</span>
          </div>
        </li>
      </ul>
    </Block>
  );
}

export function AnalyticsPreview() {
  return (
    <Block title="Аналитика канала" icon={<Icon name="arrow-up" size={16} />} marker={<PreviewBadge />}>
      <p className={styles.previewDescription}>
        Макет будущей Telegram-аналитики. Цифры не являются реальными данными.
      </p>
      <div className={styles.cellGrid} aria-label="Пример будущих метрик">
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
    </Block>
  );
}

export function WatchlistPreview() {
  return (
    <Block title="Отслеживание" icon={<Icon name="search" size={16} />} marker={<PreviewBadge />}>
      <p className={styles.previewDescription}>Будущие watchlists для героев, предметов и событий.</p>
      <div className={styles.cellGrid}>
        <div className={styles.watchItem}>
          <strong>Tidehunter</strong>
          <span>Герой</span>
        </div>
        <div className={styles.watchItem}>
          <strong>Сундуки</strong>
          <span>Cosmetics</span>
        </div>
        <div className={styles.watchItem}>
          <strong>Патчи</strong>
          <span>События</span>
        </div>
      </div>
    </Block>
  );
}
