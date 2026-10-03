# MVP page map — аналитический baseline

Этот список исходно зафиксирован архитектурой фронтенда; аналитик уточняет при реализации каждой user story. 

| Путь | Задача | Критичные состояния |
|---|---|---|
| /login | Одноразовый вход | invalid/expired code, rate limit |
| / | Здоровье задач, публикации, инциденты | stale/partial data |
| /posts | Фильтр и поиск черновиков | empty/error/forbidden |
| /posts/new | Новый черновик | dirty/validation |
| /posts/:id | Редактор, ревизии, preview | conflict 409, unsaved |
| /calendar | Планировать/переносить/отменять | timezone/DST, unsafe retry |
| /media | Исходники и шаблоны | upload validation/failure |
| /incidents | Unknown Telegram, ошибка и ручная сверка | no optimistic success |
| /settings | Каналы, график, роли | permission denied |
| /* | 404 | return to safe navigation |

Веб и Telegram Mini App — две оболочки одной кодовой базы; сложная видеозагрузка может открывать полноценный браузер.
