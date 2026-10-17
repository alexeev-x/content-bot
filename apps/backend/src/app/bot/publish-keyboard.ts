import type { InlineKeyboardButton, InlineKeyboardMarkup } from 'grammy/types';
import { callbackDataOf, type PublishButton } from './publish-actions';

export const STUDIO_BUTTON_TEXT = 'Открыть в Студии';
export const PUBLICATIONS_BUTTON_TEXT = 'Открыть в Публикациях';
const CHANNEL_TITLE_MAX = 32;

const shortTitle = (title: string): string =>
  title.length > CHANNEL_TITLE_MAX ? `${title.slice(0, CHANNEL_TITLE_MAX - 1)}…` : title;

// One publish button per channel, then the Studio button. Without a known origin there is no Studio
// button (a web_app button needs an https URL); the publish buttons do not depend on it.
export function publishKeyboard(input: {
  appOrigin: string | null;
  postId: string;
  buttons: readonly PublishButton[];
  /**
   * Where the Studio button opens: the publish screen (default), the post itself, or the post's publications —
   * after «Поставлено в очередь» the publish screen only invited a second publication (owner, 17.10.2026).
   */
  studio?: 'publish' | 'post' | 'publications';
}): InlineKeyboardMarkup | undefined {
  const rows: InlineKeyboardButton[][] = input.buttons.map((button) => [
    { text: `Опубликовать сейчас → ${shortTitle(button.channelTitle)}`, callback_data: callbackDataOf(button.token) }
  ]);
  if (input.appOrigin !== null) {
    const path =
      input.studio === 'publications'
        ? `/publications?post=${input.postId}`
        : `/posts/${input.postId}${input.studio === 'post' ? '' : '/publish'}`;
    rows.push([
      {
        text: input.studio === 'publications' ? PUBLICATIONS_BUTTON_TEXT : STUDIO_BUTTON_TEXT,
        web_app: { url: `${input.appOrigin}${path}` }
      }
    ]);
  }
  return rows.length === 0 ? undefined : { inline_keyboard: rows };
}
