import type { TelegramBotAdminApi } from '../../integrations/telegram/telegram-api';
import type { TelegramCaller } from './telegram-call';

// Only commands the bot really answers are registered. /status still answers when typed, but is not in the menu
// (owner, 18.10.2026).
export const OWNER_COMMANDS = [
  { command: 'start', description: 'Открыть студию' },
  { command: 'redactor', description: 'ИИ-редактор: написать пост или рилс' },
  { command: 'post', description: 'Создать пост: сообщения становятся черновиками' },
  { command: 'analytics', description: 'Аналитика сейчас: 6 последних роликов' },
  { command: 'stop', description: 'Выйти из редактора или режима постов' }
];

// The owner's private chat: its command list and a menu button that shows it (owner decision 15.10.2026:
// the commands must be visible; the studio opens from /start). Sets the same values every time.
export async function configureOwnerChat(
  deps: { api: TelegramBotAdminApi; call: TelegramCaller },
  input: { ownerId: number }
): Promise<void> {
  const { api, call } = deps;
  await call.act('owner_chat.set_commands', (signal) => api.setChatCommands(input.ownerId, OWNER_COMMANDS, signal));
  await call.act('owner_chat.set_menu_button', (signal) => api.setChatMenuCommands(input.ownerId, signal));
}
