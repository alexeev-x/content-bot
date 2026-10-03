import React from 'react';
import { createRoot } from 'react-dom/client';
import './tokens.css';

const paths = ['Обзор','Публикации','Редактор','Календарь','Медиа','Инциденты','Настройки'];
function App() {
  return <div className="shell"><aside><strong className="brand">ALEXEEV / STUDIO</strong><nav aria-label="Разделы">{paths.map((p,i)=><span className={i===0?'active':''} key={p}>{p}</span>)}</nav></aside><main><div className="eyebrow">CONTENT OPERATIONS / MVP</div><h1>Центр управления</h1><p className="muted">Подготовлен интерфейс. Отправка публикаций недоступна до настройки безопасного backend и staging.</p><section className="grid"><article><small>Статус API</small><h2>Не подключён</h2><p>Для включения необходимы Worker и авторизация.</p></article><article><small>Публикации</small><h2>Отключены</h2><p>Никаких фиктивных статусов успешной отправки.</p></article><article><small>Дизайн</small><h2>Без Figma</h2><p>Токены и компоненты хранятся в репозитории.</p></article></section><section className="panel"><h2>Этапы запуска</h2><p>1. Авторизация и DTO → 2. Черновики и D1 → 3. Queue/Cron → 4. Staging Telegram → 5. Проверка QA.</p><button disabled title="Недоступно до подтверждённого backend">Создать публикацию (пока недоступно)</button></section></main></div>
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
