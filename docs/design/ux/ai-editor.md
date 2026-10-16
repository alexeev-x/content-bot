# §3.11 ИИ-редактор `/ai`

Owner, 16.10.2026: the AI is a section of its own; «Настройки → ИИ» keeps only models, budget and quality.
Planned tabs, in order: «Обо мне», «Черновики», «Прогоны», «Обзор», «Правила голоса». Built: «Обо мне».

## «Обо мне» (as built)

- **Дота:** rank («Герой 2»), matches (wins and losses), Dota Plus, the five most played heroes with games and
  win rate, when it was read. «Обновить из Доты» reads OpenDota now; Cron reads it once a day. With public
  match data off in Dota, a warning says where to turn it on. Without a Dota Friend ID the card says to enter it.
- **Обо мне** (one form, «Сохранить» under a revision): Dota Friend ID, hours in Dota, heroes being learnt
  (comma-separated), «Пока не понимаю», «Эксперименты рубрик», «Сейчас актуально».
- **Так ИИ видит вас:** the exact text sent with every AI request (built on the server).
- States: skeleton with the loaded panel heights; load error with retry; save conflict reloads and says so.
