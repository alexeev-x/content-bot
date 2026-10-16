import type { InlineKeyboardButton, InlineKeyboardMarkup } from 'grammy/types';
import { callbackDataOf, type PublishButton } from './publish-actions';

export const STUDIO_BUTTON_TEXT = 'Открыть в Студии';
const CHANNEL_TITLE_MAX = 32;

const shortTitle = (title: string): string =>
  title.length > CHANNEL_TITLE_MAX ? `${title.slice(0, CHANNEL_TITLE_MAX - 1)}…` : title;

// One publish button per channel, then the Studio button. Without a known origin there is no Studio
// button (a web_app button needs an https URL); the publish buttons do not depend on it.
export function publishKeyboard(input: {
  appOrigin: string | null;
  postId: string;
  buttons: readonly PublishButton[];
  /** Where the Studio button opens: the publish screen (default) or the post itself. */
  studio?: 'publish' | 'post';
}): InlineKeyboardMarkup | undefined {
  const rows: InlineKeyboardButton[][] = input.buttons.map((button) => [
    { text: `Опубликовать сейчас → ${shortTitle(button.channelTitle)}`, callback_data: callbackDataOf(button.token) }
  ]);
  if (input.appOrigin !== null) {
    rows.push([
      {
        text: STUDIO_BUTTON_TEXT,
        web_app: { url: `${input.appOrigin}/posts/${input.postId}${input.studio === 'post' ? '' : '/publish'}` }
      }
    ]);
  }
  return rows.length === 0 ? undefined : { inline_keyboard: rows };
}
