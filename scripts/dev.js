#!/usr/bin/env node
/**
 * Локальная разработка одной командой: миграции, воркер и доставка апдейтов Telegram.
 *
 *   pnpm dev                  — всё сразу
 *   pnpm dev --no-bot         — только воркер (апдейты слать curl'ом)
 *   pnpm dev --reset-webhook  — снять webhook перед стартом (getUpdates с ним несовместим)
 *   pnpm dev --port 8788      — другой порт
 *
 * Почему опрос, а не webhook: Telegram делает POST на публичный адрес, а до localhost он не
 * достучится. Поэтому апдейты забираем сами (long polling, как это делает Telegraf) и отдаём
 * воркеру тем же запросом и с тем же заголовком секрета, что прислал бы Telegram. Обработчик
 * разницы не видит — локально проверяется ровно то, что поедет в прод.
 *
 * Отдельный скрипт, а не цепочка через && или concurrently: одинаково работает в zsh и PowerShell.
 */
import { spawn, spawnSync } from 'node:child_process';
import { readDevVars, ROOT } from './dev-vars.js';
import { deliverUpdates } from './deliver-updates.js';
import { toolPath } from './tool-path.js';

const IS_WINDOWS = process.platform === 'win32';
const POLL_SECONDS = 30;

const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = portIndex === -1 ? '8787' : (args[portIndex + 1] ?? '8787');
const withBot = !args.includes('--no-bot');
const baseUrl = `http://127.0.0.1:${port}`;

const wrangler = toolPath('wrangler');
const children = new Set();

const log = (label, color, line) => process.stdout.write(`\x1b[${color}m${label}\x1b[0m ${line}\n`);

const stopAll = () => {
  for (const child of children) {
    if (IS_WINDOWS && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
};

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopAll();
    process.exit(0);
  });
}

// --- воркер ---------------------------------------------------------------

// Миграции прогоняем сами: иначе после git pull код ждёт таблицу, которой ещё нет.
// Операция идемпотентная — применённое повторно не применяется.
const migration = spawnSync(
  process.execPath,
  [wrangler, 'd1', 'migrations', 'apply', 'DB', '--env', 'dev', '--local'],
  {
    cwd: ROOT,
    stdio: 'inherit',
  },
);
if (migration.status !== 0) process.exit(migration.status ?? 1);

const worker = spawn(process.execPath, [wrangler, 'dev', '--env', 'dev', '--port', port], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
});

children.add(worker);
worker.on('error', () => {
  stopAll();
  process.exit(1);
});

for (const stream of [worker.stdout, worker.stderr]) {
  stream?.on('data', (chunk) => {
    for (const line of chunk.toString().split('\n')) if (line.trim()) log('[worker]', '90', line);
  });
}

worker.on('exit', (code) => {
  log('[dev]   ', '31', `воркер остановился (код ${code})`);
  stopAll();
  process.exit(code ?? 1);
});

if (!withBot) {
  log('[dev]   ', '36', `воркер на ${baseUrl}, доставка Telegram отключена (--no-bot)`);
  await new Promise(() => {});
}

// --- доставка апдейтов ----------------------------------------------------

const vars = readDevVars();
const token = process.env.BOT_TOKEN || vars.BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET || vars.TELEGRAM_WEBHOOK_SECRET;

if (!token || !secret) {
  log('[bot]   ', '31', 'нужны BOT_TOKEN и TELEGRAM_WEBHOOK_SECRET в .dev.vars');
  stopAll();
  process.exit(1);
}

/**
 * Таймаут обязателен: long poll держит соединение открытым, и если его оборвут снаружи
 * (кто-то ещё вызвал getUpdates — Telegram пускает одного читателя), fetch может не завершиться
 * никогда. Без таймаута доставка молча замирает навсегда.
 */
const callTelegram = async (method, body, timeoutMs = 15_000) => {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const payload = await response.json();
  if (!payload.ok) throw new Error(`${method}: ${payload.description ?? 'неизвестная ошибка'}`);
  return payload.result;
};

const waitForWorker = async () => {
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    try {
      // Годится любой ответ, в том числе 404: важно лишь, что воркер принимает соединения.
      await fetch(baseUrl, { signal: AbortSignal.timeout(2000) });
      return true;
    } catch {
      // воркер ещё поднимается
    }
    await new Promise((done) => setTimeout(done, 500));
  }

  return false;
};

if (!(await waitForWorker())) {
  log('[dev]   ', '31', 'воркер не поднялся за минуту');
  stopAll();
  process.exit(1);
}

const webhookInfo = await callTelegram('getWebhookInfo');

if (webhookInfo.url) {
  if (!args.includes('--reset-webhook')) {
    log('[bot]   ', '31', `у бота включён webhook (${webhookInfo.url}) — getUpdates с ним несовместим`);
    log('[bot]   ', '31', 'снять и работать локально: pnpm dev --reset-webhook');
    stopAll();
    process.exit(1);
  }

  await callTelegram('deleteWebhook');
  log('[bot]   ', '36', 'webhook снят, апдейты забираем сами');
}

const me = await callTelegram('getMe');
log('[bot]   ', '36', `@${me.username} -> ${baseUrl}/telegram/webhook`);

let offset = 0;

while (!worker.killed) {
  let updates;

  try {
    updates = await callTelegram(
      'getUpdates',
      { offset, timeout: POLL_SECONDS, allowed_updates: ['message', 'callback_query'] },
      (POLL_SECONDS + 10) * 1000,
    );
  } catch (error) {
    // Оборванный или зависший long poll — обычное дело, просто опрашиваем заново.
    if (error.name === 'TimeoutError' || error.name === 'AbortError') continue;

    if (error.message.includes('terminated by other getUpdates')) {
      log('[bot]   ', '31', 'апдейты уже читает другой процесс — закрой второй pnpm dev');
      stopAll();
      process.exit(1);
    }

    log('[bot]   ', '31', `${error.message}, повтор через 3 с`);
    await new Promise((done) => setTimeout(done, 3000));
    continue;
  }

  const previousOffset = offset;
  offset = await deliverUpdates(updates, offset, async (update) => {
    let response;

    try {
      response = await fetch(`${baseUrl}/telegram/webhook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret },
        body: JSON.stringify(update),
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      log('[bot]   ', '31', `${update.update_id}  воркер не ответил`);
      throw new Error('Доставка не подтверждена');
    }

    log('[bot]   ', '36', `${update.update_id}  ${response.status}`);
    if (!response.ok) throw new Error('Доставка не подтверждена');
  });
  if (updates.length && offset === previousOffset) await new Promise((done) => setTimeout(done, 3000));
}
