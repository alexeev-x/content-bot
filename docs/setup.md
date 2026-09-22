# Установка и запуск

Разработка идёт **на двух машинах: macOS (zsh) и Windows (PowerShell)**. Node 24, pnpm 10, wrangler 4.
Команды `pnpm` одинаковы в обеих системах; различия — только в мелочах, они отмечены ниже.

## Установка

```bash
pnpm install
```

`postinstall` сам генерирует `worker-configuration.d.ts` — типы биндингов для окружения `dev`.

## Одинаковость двух машин

Чтобы репозиторий не «дёргался» при переходе между ОС:

- **`packageManager: "pnpm@10.x"`** в `package.json` + Corepack — обе машины берут одну версию pnpm,
  глобальная установка значения не имеет.
- **`.gitattributes` с `* text=auto eol=lf`** и `"endOfLine": "lf"` в `.prettierrc` — иначе Windows
  запишет CRLF, и весь файл покажется изменённым. `core.autocrlf` при этом оставляем `false`.
- **Скрипты `package.json` — только кроссплатформенные**: бинарники из `node_modules` и `node`.
  ❌ `rm`, `cp`, `mkdir -p`, `export VAR=`, `$(...)`, `.sh`-файлы. Нужен шаг сложнее одной команды —
  пишем `scripts/<имя>.js` на Node (он одинаково работает везде), а не цепочку через `&&`:
  в PowerShell 5.1 `&&` не поддерживается.
- **Husky на Windows** работает через Git Bash (ставится вместе с Git for Windows). Хуки пишем на
  POSIX sh, без bash-измов.
- В импортах **регистр букв соблюдаем точно**: macOS и Windows его прощают, рантайм Workers — нет.

⚠️ **Windows:** если PowerShell отказывается запускать `pnpm` («выполнение сценариев отключено»),
разово разреши их — `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` — либо вызывай `pnpm.cmd`.
Обходные конструкции вида `npx --yes pnpm@<версия>` в документации и скриптах не закрепляем.

## Команды

```bash
pnpm dev          # локальный воркер на 8787 (--port 8788 — другой порт)
pnpm check        # типы, линт со слоями, формат, тесты (он же на pre-push)
pnpm fix          # то же, но с автоисправлением
pnpm test         # только тесты, внутри workerd
pnpm deploy:dev   # деплой воркера в dev
pnpm deploy:prod  # то же в production
pnpm cf-typegen   # типы биндингов, после ЛЮБОЙ правки wrangler.jsonc
pnpm skills       # разложить скилы из docs/skills по папкам агентов
```

Git-хуки (husky): **pre-commit** → `lint-staged` (ESLint --fix и Prettier по застейдженным), затем
TypeScript и полный Prettier. **pre-push** → `pnpm check`.

## Локальная разработка

```bash
pnpm dev
```

`wrangler dev` поднимает воркер локально — логин в Cloudflare и публичный адрес для этого не нужны.
Правки кода подхватываются на лету. Роутов пока нет, поэтому любой путь отвечает 404:

```bash
curl -i http://127.0.0.1:8787/
```

Логи локального воркера читаются запросом, их не нужно искать в терминале:

```bash
curl -s -X POST http://127.0.0.1:8787/cdn-cgi/local/explorer/api/local/observability/query \
  -H 'Content-Type: application/json' \
  -d '{"sql":"SELECT message FROM logs ORDER BY rowid DESC LIMIT 20"}'
```

## Секреты

Секретов пока нет ни одного. Когда появится первый:

- локально — строкой `KEY=value` в `.dev.vars` (файл в `.gitignore`), рядом заводим
  `.dev.vars.example` с пустыми полями и коммитим его;
- в Cloudflare — `pnpm exec wrangler secret put NAME --env dev`;
- ❌ никогда в `vars` внутри `wrangler.jsonc`, в код, в логи и в коммиты.

Случайная строка для секрета — одинаково в обеих оболочках:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

## Деплой

Не выполнялся ни разу: нужен `wrangler login`. Деплой всегда с явным окружением.

```bash
pnpm exec wrangler login
pnpm deploy:dev     # или pnpm deploy:prod
```

## Если внешний вызов висит 15 секунд

Симптом: первый вызов внешнего API из воркера виснет до таймаута, а повтор проходит мгновенно.

Причина не в коде: **сломанный IPv6 в локальной сети**. Роутер его анонсирует, система берёт адрес,
а трафик не проходит. Node и curl спасает Happy Eyeballs — они пробуют оба протокола и берут тот,
что ответил. `workerd` так не умеет и честно ждёт таймаута на IPv6.

Проверка (подставь свой хост):

```bash
curl -4 -s -o /dev/null -m 8 -w "IPv4: %{http_code} за %{time_total}s\n" https://example.com/
curl -6 -s -o /dev/null -m 8 -w "IPv6: %{http_code} за %{time_total}s\n" https://example.com/
```

Если IPv4 отвечает за доли секунды, а IPv6 упирается в таймаут — отключить IPv6 на интерфейсе:

```bash
sudo networksetup -setv6off Wi-Fi        # вернуть обратно: -setv6automatic Wi-Fi
```

В Windows: `Win + R` → `ncpa.cpl` → активное подключение → **Свойства** → снять галочку
**Internet Protocol Version 6 (TCP/IPv6)** → ОК. Не отключай IPv6, если проверка выше показывает,
что он отвечает нормально.

На задеплоенном воркере этой проблемы нет: у Cloudflare IPv6 рабочий.
