import type { TelegramBotAdminApi } from '../../integrations/telegram/telegram-api';
import type { TelegramCaller } from './telegram-call';

// Only commands the bot really answers are registered.
const OWNER_COMMANDS = [{ command: 'start', description: 'Открыть студию' }];
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
