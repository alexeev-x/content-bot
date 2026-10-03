# MVP page map — analytical baseline

This list was originally fixed by the frontend architecture; the analyst refines it while implementing each user story. 

| Path | Task | Critical states |
|---|---|---|
| /login | «Войти через Telegram» (in the Mini App, sign-in is automatic) | foreign Telegram ID (403), sign-in cancelled, expired session |
| / | Job health, publications, incidents | stale/partial data |
| /posts | Filter and search drafts | empty/error/forbidden |
| /posts/new | New draft | dirty/validation |
| /posts/:id | Editor, revisions, preview | conflict 409, unsaved |
| /calendar | Schedule/reschedule/cancel | timezone/DST, unsafe retry |
| /media | Sources and templates | upload validation/failure |
| /incidents | Unknown Telegram, error and manual reconciliation | no optimistic success |
| /settings | Channels, group, schedule | save error, revision conflict |
| /* | 404 | return to safe navigation |

The web app and the Telegram Mini App are the same admin panel (see `FRONTEND_ARCHITECTURE.md` §16); the 375 px mobile width is the primary screen. Complex video upload may open a full browser.
