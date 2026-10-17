# Composer visual references — 17.10.2026

**Design specification:** [docs/design/ux/post-composer.md](../../docs/design/ux/post-composer.md). These are **static design mockups**, not production UI, working actions, or confirmation that their features are deployed. Screens must be compared against the real app and contracts before implementation. The mockups use illustrative text, placeholder media and `МАКЕТ` preview: never treat these as real analytics or channel data.

## Reference map

| State | Desktop 1440 px | Mobile 390 px | Expected behavior |
| --- | --- | --- | --- |
| Редактор (основной) | [compose_desktop_editor.png](compose_desktop_editor.png) | [compose_mobile_editor.png](compose_mobile_editor.png) | **No title input**, formatting toolbar immediately above an unboxed text editor, `Фото и видео` below |
| Выбор эмодзи | [compose_desktop_emoji.png](compose_desktop_emoji.png) | [compose_mobile_emoji.png](compose_mobile_emoji.png) | Insert at caret or selection, retain Telegram entities and undo history |
| Редактор с медиа | [compose_desktop_media.png](compose_desktop_media.png) | [compose_mobile_media.png](compose_mobile_media.png) | Media below editor in form; above caption in Telegram preview |
| ИИ «Было / Стало» | [compose_desktop_compare.png](compose_desktop_compare.png) | [compose_mobile_compare.png](compose_mobile_compare.png) | Proposed change never replaces text without explicit «Применить» |
| Опрос | [compose_desktop_poll.png](compose_desktop_poll.png) | [compose_mobile_poll.png](compose_mobile_poll.png) | **API NEED**, don't ship as working before backend Telegram poll support |
| Настройки | [compose_desktop_settings.png](compose_desktop_settings.png) | [compose_mobile_settings.png](compose_mobile_settings.png) | Existing channel/time flow stays on `/posts/:id/publish`; no invented switches |

**Source:** [composer-template.html](composer-template.html). Screens are produced by [render-composer.mjs](render-composer.mjs) and the [post-composer-refs workflow](../../.github/workflows/post-composer-refs.yml).

To regenerate locally from the repository root, with dependencies and Playwright Chromium installed:

```bash
node design-refs/posts/render-composer.mjs
```

The dedicated workflow runs only on `develop`, when its source/template/workflow changes, commits the PNGs back to `develop`, and never touches `main` or deploys an application. The normal project CI still determines deployment behavior for application changes.

### Visual rules for implementation

- Follow `docs/design/README.md` for actual colors, surfaces, font (Onest), controls, responsive breakpoints, and accessibility. HTML uses a system-font fallback for the mockup, not a replacement production token.
- Preserve the safety model and existing media/formatting paths. Show only real API-driven statuses, real media attachments and data.
- The screenshots are **static examples**. The exact states, errors, loading, interactions, keyboard operation and disabled controls are specified in [post-composer.md](../../docs/design/ux/post-composer.md).
- No owner approval or Telegram send occurs by drawing a mockup.
