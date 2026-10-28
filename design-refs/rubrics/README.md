# Rubric pictures

One folder per rubric, named `<number>-<rubric key>` as in «Тестирование» → «Рубрики» (the list of 27.10.2026); a new rubric gets its folder when it is reworked. Each folder's README says what the
rubric is, what its picture shows now and, once the owner approves it, its status.

Pictures are drawn by code alone as simple HTML pages with Valve's exact images (owner, 26.10.2026: «будем делать простые
как сейчас»); no image templates are dropped here. A rubric is reworked one at a time with the `rubric-designer` agent
and its preview script (`node .agents/scripts/rubric-preview.mjs <key>`).
