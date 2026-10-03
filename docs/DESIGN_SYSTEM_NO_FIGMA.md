# ALEXEEV — дизайн исключительно в коде

**Решение владельца 03.10.2026: Figma не нужна вообще.** Исключить Figma tasks, exports, licenses и handoff. Single source of truth: `apps/admin/src/app/styles/tokens.css`, `apps/admin/src/shared/ui`, страницы и их состояния в репозитории.

## Артефакты дизайнера
1. `tokens.css`: semantic colors, type scale, spacing, radius, elevation, motion, breakpoint usage; light/dark и Telegram theme mapping там, где потребуется.
2. Примитивы: Button, Input, Select, Dialog, Toast, StatusBadge, Table, Tabs и ошибки/пустые состояния. Компонент имеет публичные props, keyboard behavior, loading/disabled/invalid examples.
3. `docs/PAGE_MAP.md`: маршруты, действия, loading/empty/error/401/403/409/unknown states и mobile layout.
4. Screenshot acceptance reference из реального браузерного рендера, Playwright diff на стабильных fixture данных.

## Передача фронтенду
Analyst → page spec → Design System Agent (tokens + reusable components) → Frontend (feature composition) → QA (browser screenshots + accessibility). Frontend никогда не ждёт нарисованного макета; если компонент отсутствует, предлагает контракт дизайнеру. Не использовать случайные hex в каждой feature. Сохранить бренд-акцент как переменную до явного утверждения цвета владельцем.

## Качество
Контраст и клавиатурный доступ по WCAG 2.2 AA как ориентир; фокус, aria, safe areas Telegram Mini App, mobile/desktop, reduced motion, размеры touch target. Screenshot diff дополняет семантические тесты, но не заменяет их.
