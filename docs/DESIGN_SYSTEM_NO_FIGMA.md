# ALEXEEV — дизайн исключительно в коде

**Решение владельца 03.10.2026: Figma не нужна вообще.** Исключить Figma tasks, exports, licenses и handoff. Single source of truth: `apps/frontend/src/app/styles/tokens.css` (до переноса — `apps/frontend/src/tokens.css`, один источник), `apps/frontend/src/shared/ui`, страницы и их состояния в репозитории.

## Артефакты дизайнера
1. `tokens.css`: semantic colors, type scale, spacing, radius, elevation, motion, breakpoint usage; light/dark и Telegram theme mapping там, где потребуется.
2. Примитивы: Button, Input, Select, Dialog, Toast, StatusBadge, Table, Tabs и ошибки/пустые состояния. Компонент имеет публичные props, keyboard behavior, loading/disabled/invalid examples.
3. `docs/PAGE_MAP.md`: маршруты, действия, loading/empty/error/401/403/409/unknown states и mobile layout.
4. Screenshot acceptance reference из реального браузерного рендера, Playwright diff на стабильных fixture данных.

## Передача фронтенду
Analyst → page spec → Design System Agent (tokens + reusable components) → Frontend (feature composition) → QA (browser screenshots + accessibility). Frontend никогда не ждёт нарисованного макета; если компонент отсутствует, предлагает контракт дизайнеру. Не использовать случайные hex в каждой feature. Сохранить бренд-акцент как переменную до явного утверждения цвета владельцем.

## Качество
Контраст и клавиатурный доступ по WCAG 2.2 AA как ориентир; фокус, aria, safe areas Telegram Mini App, mobile/desktop, reduced motion, размеры touch target. Screenshot diff дополняет семантические тесты, но не заменяет их.

## Исполняемые артефакты (для агентов)
Роль `design-system` (`.agents/roles/design-system.md`); визуальное направление — skill `visual-design` (адаптация Anthropic `frontend-design`); паттерны взаимодействия — skill `ui-patterns`; спецификация страницы — skill `page-spec`; визуальная проверка — skill `visual-check`. Решение владельца: монохромные тёмная и светлая темы без ярких акцентов; текущая палитра (`#0c0c0d` + `#d5f15b`) подлежит замене. UI-библиотека будет выбрана отдельно. Компонентный каталог — dev-маршрут `/__catalog` со всеми состояниями примитивов (без Storybook, чтобы скриншоты и axe проверяли те же компоненты, что в продукте). Стили компонентов — CSS Modules, только через токены.
