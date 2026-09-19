#!/usr/bin/env node
/**
 * Всё про самого бота в Telegram.
 *
 *   pnpm bot                          — проверить токен, выставить меню команд, показать BOT_INFO
 *   pnpm bot --whoami                 — Telegram ID тех, кто писал боту (свой OWNER_TELEGRAM_ID)
 *   pnpm bot --webhook <https://...>  — зарегистрировать webhook на этот адрес
 *   pnpm bot --delete-webhook         — снять webhook (нужно, чтобы вернуться к локальной разработке)
 *   pnpm bot --delete-topic <id>      — удалить тему по message_thread_id (обслуживание, необратимо)
 *
 * Токен берётся из .dev.vars или переменной BOT_TOKEN и никогда не печатается.
 * Для прод-бота: BOT_TOKEN=<токен> pnpm bot
 */
import { readDevVars } from './dev-vars.js';

const vars = readDevVars();
const token = process.env.BOT_TOKEN || vars.BOT_TOKEN;

if (!token || token.includes('FAKE_TOKEN')) {
  console.error('Нет настоящего токена. Создай бота в @BotFather и впиши BOT_TOKEN в .dev.vars.');
  process.exit(1);
}

const call = async (method, body) => {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json();
  if (!payload.ok) throw new Error(`${method}: ${payload.description ?? 'неизвестная ошибка'}`);
  return payload.result;
};

const args = process.argv.slice(2);

if (args.includes('--whoami')) {
  // ⚠️ getUpdates пускает одного читателя: этот вызов оборвёт опрос запущенного pnpm dev.
  console.log('Если сейчас запущен pnpm dev — после этой команды перезапусти его.\n');
  const updates = await call('getUpdates', { limit: 20 });
  const people = new Map();

  for (const update of updates) {
    const from = update.message?.from;
    if (from && !from.is_bot) people.set(from.id, [from.first_name, from.last_name].filter(Boolean).join(' '));
  }

  if (people.size === 0) {
    console.log('Никто боту ещё не писал. Напиши ему что-нибудь и запусти снова.');
    console.log('⚠️ С включённым webhook getUpdates не работает: сними его через --delete-webhook.');
  } else {
    console.log('Кто писал боту:');
    for (const [id, name] of people) console.log(`  ${id}  ${name}`);
    console.log('\nСвой id впиши в .dev.vars как OWNER_TELEGRAM_ID.');
  }

  process.exit(0);
}

if (args.includes('--delete-webhook')) {
  await call('deleteWebhook');
  console.log('Webhook снят. Апдейты снова можно забирать локально через pnpm dev.');
  process.exit(0);
}

const topicIndex = args.indexOf('--delete-topic');

/**
 * Удаление темы живёт здесь, а НЕ командой бота: оно необратимо — вместе с темой исчезают все
 * сообщения в ней, и вернуть их Bot API не умеет. В чате одна опечатка стоила бы раздела целиком,
 * поэтому операция доступна только осознанно, из терминала.
 */
if (topicIndex !== -1) {
  const threadId = Number(args[topicIndex + 1]);
  const chatId = Number(process.env.OWNER_TELEGRAM_ID || vars.OWNER_TELEGRAM_ID);

  if (!Number.isInteger(threadId) || !Number.isInteger(chatId)) {
    console.error('Нужны message_thread_id темы и OWNER_TELEGRAM_ID: pnpm bot --delete-topic 123');
    process.exit(1);
  }

  await call('deleteForumTopic', { chat_id: chatId, message_thread_id: threadId });
  console.log(
    `Тема ${threadId} удалена вместе со всей перепиской. Запись D1 и журнал нужно сверить вручную по docs/recovery.md; /setup не пересоздаёт удалённые темы.`,
  );
  process.exit(0);
}

const webhookIndex = args.indexOf('--webhook');

if (webhookIndex !== -1) {
  const baseUrl = args[webhookIndex + 1];
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || vars.TELEGRAM_WEBHOOK_SECRET;

  if (!baseUrl?.startsWith('https://')) {
    console.error('Нужен публичный HTTPS-адрес: pnpm bot --webhook https://<worker>.workers.dev');
    process.exit(1);
  }

  if (!secret) {
    console.error('Нет TELEGRAM_WEBHOOK_SECRET — он должен совпадать с секретом воркера.');
    process.exit(1);
  }

  const url = `${baseUrl.replace(/\/$/, '')}/telegram/webhook`;
  await call('setWebhook', { url, secret_token: secret, allowed_updates: ['message'], drop_pending_updates: false });
  console.log(`Webhook зарегистрирован: ${url}`);
  console.log('⚠️ Пока он включён, локальный pnpm dev апдейтов не получит.');
  process.exit(0);
}

const { menuCommands } = await import('../src/const/commands.ts');

const commands = menuCommands.map((item) => ({ command: item.name, description: item.description }));

const me = await call('getMe');
await call('setMyCommands', { commands, scope: { type: 'all_private_chats' } });

console.log(`Бот: @${me.username} (id ${me.id})`);
console.log(`Меню команд: ${commands.map((item) => '/' + item.command).join(', ')}`);
console.log(`Темы в личных чатах: ${me.has_topics_enabled ? 'включены ✅' : 'выключены ❌'}`);

if (!me.has_topics_enabled) {
  console.log('  Включить: @BotFather → Mini App → бот → Threads Settings → Threaded Mode.');
}

console.log('\nСтрока для .dev.vars (экономит вызов getMe на холодном старте):');
console.log(`BOT_INFO=${JSON.stringify(me)}`);
