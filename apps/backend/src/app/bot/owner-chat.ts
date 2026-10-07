import type { TelegramBotAdminApi } from '../../integrations/telegram/telegram-api';
import type { TelegramCaller } from './telegram-call';

// Only commands the bot really answers are registered.
export const OWNER_COMMANDS = [
  { command: 'start', description: 'Открыть студию' },
  { command: 'today', description: 'План и итоги на сегодня' },
  { command: 'next', description: 'Ближайшие 5 публикаций' },
  { command: 'status', description: 'Публикация, Cron и проблемы' }
];
const MENU_BUTTON_TEXT = 'Студия';

// The owner's private chat: its command list and the menu button that opens the studio. Sets the
// same values every time, so it is safe to repeat.
export async function configureOwnerChat(
  deps: { api: TelegramBotAdminApi; call: TelegramCaller },
  input: { ownerId: number; appOrigin: string }
): Promise<void> {
  const { api, call } = deps;
  await call.act('owner_chat.set_commands', (signal) => api.setChatCommands(input.ownerId, OWNER_COMMANDS, signal));
  await call.act('owner_chat.set_menu_button', (signal) =>
    api.setChatMenuWebApp(input.ownerId, { text: MENU_BUTTON_TEXT, url: `${input.appOrigin}/` }, signal)
  );
}
