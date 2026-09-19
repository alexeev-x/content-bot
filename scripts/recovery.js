#!/usr/bin/env node
/** Обслуживание локального inbox/журнала. Команды resolve — только после сверки с Telegram. */
import { spawnSync } from 'node:child_process';
import { readDevVars, ROOT } from './dev-vars.js';
import { toolPath } from './tool-path.js';

const args = process.argv.slice(2);
const [command, id] = args;
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const query = (sql) => {
  const result = spawnSync(
    process.execPath,
    [toolPath('wrangler'), 'd1', 'execute', 'DB', '--env', 'dev', '--local', '--json', '--command', sql],
    { cwd: ROOT, encoding: 'utf8' },
  );
  if (result.status !== 0) throw new Error('Запрос к локальной D1 не выполнен. Проверь миграции и доступность базы.');
  const output = JSON.parse(result.stdout);
  if (!output[0]?.success) throw new Error('D1 не подтвердила запрос');
  return output[0];
};
const positive = (raw) => {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Нужен положительный целочисленный ID');
  return value;
};

if (command === 'list') {
  console.table(
    query(
      "SELECT update_id,state,last_error,lease_until FROM telegram_updates WHERE state != 'done' ORDER BY received_at LIMIT 100",
    ).results,
  );
  console.table(
    query(
      "SELECT key,method,state,updated_at,not_before FROM telegram_operations WHERE state != 'succeeded' ORDER BY updated_at LIMIT 100",
    ).results,
  );
} else if (command === 'retry') {
  const updateId = positive(id);
  const [row] = query(`SELECT payload,state,lease_until FROM telegram_updates WHERE update_id = ${updateId}`).results;
  if (!row?.payload || row.state === 'done') throw new Error('Незавершённый апдейт не найден');
  if (row.lease_until > Date.now()) throw new Error('Обработка ещё занята; дождись истечения аренды');
  const vars = readDevVars();
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || vars.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) throw new Error('Не настроен TELEGRAM_WEBHOOK_SECRET');
  const response = await fetch('http://127.0.0.1:8787/telegram/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret },
    body: row.payload,
    signal: AbortSignal.timeout(60_000),
  });
  console.log(`Апдейт ${updateId}: HTTP ${response.status}`);
  if (!response.ok) process.exitCode = 1;
} else if (command === 'resolve' && id) {
  const [row] = query(`SELECT * FROM telegram_operations WHERE key = ${quote(id)}`).results;
  if (!row) throw new Error('Операция не найдена');
  if (row.state === 'succeeded') throw new Error('Операция уже подтверждена');
  if (row.state === 'sending' && row.updated_at > Date.now() - 120_000)
    throw new Error('Отправка ещё может выполняться; дождись истечения аренды');
  let result;
  if (args[2] === '--not-sent' && args.length === 3) {
    result = null;
  } else if (args[2] === '--thread-id' && args.length === 4 && row.method === 'createForumTopic') {
    result = { message_thread_id: positive(args[3]), name: JSON.parse(row.payload).name };
  } else if (args[2] === '--message-id' && args.length === 4 && row.method === 'sendMessage') {
    result = { message_id: positive(args[3]) };
  } else
    throw new Error('Укажи подтверждённый --thread-id, --message-id или --not-sent; инструкция в docs/recovery.md');
  const changed = query(
    `UPDATE telegram_operations SET state = ${quote(result ? 'succeeded' : 'retry')}, result = ${result ? quote(JSON.stringify(result)) : 'NULL'}, not_before = 0, updated_at = ${Date.now()} WHERE key = ${quote(id)} AND state = ${quote(row.state)} AND updated_at = ${row.updated_at}`,
  );
  if (changed.meta.changes !== 1) throw new Error('Состояние изменилось параллельно; перечитай список');
  console.log('Результат сверки сохранён. Теперь можно повторить незавершённый апдейт.');
} else {
  console.log(
    'pnpm recover list | retry <update_id> | resolve <key> --thread-id <id> | --message-id <id> | --not-sent',
  );
  if (command) process.exitCode = 1;
}
