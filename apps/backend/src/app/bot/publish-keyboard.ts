import type { InlineKeyboardButton, InlineKeyboardMarkup } from 'grammy/types';
import { callbackDataOf, type PublishButton } from './publish-actions';

/** «🕒 Запланировать»: the same token, the time picked under it (callback_data ≤ 64 bytes). */
export const SCHEDULE_PREFIX = 'sch:';
export type ScheduleChoice = 'h1' | 't19' | 'm10' | 'own' | 'back' | 'cancel';
export const scheduleDataOf = (token: string, choice?: ScheduleChoice): string =>
  `${SCHEDULE_PREFIX}${token}${choice === undefined ? '' : `:${choice}`}`;

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
  // Per channel: send now, and «🕒» to pick a time (owner, 17.10.2026: scheduling only in the Studio was too far).
  const rows: InlineKeyboardButton[][] = input.buttons.flatMap((button) => [
    [{ text: `Опубликовать сейчас → ${shortTitle(button.channelTitle)}`, callback_data: callbackDataOf(button.token) }],
    [{ text: `🕒 Запланировать → ${shortTitle(button.channelTitle)}`, callback_data: scheduleDataOf(button.token) }]
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

/** The time choices under one channel's «🕒»: the quick ones still ahead, «Своё время» and the way back. */
export function scheduleKeyboard(token: string, options: { evening: boolean }): InlineKeyboardMarkup {
  const quick: InlineKeyboardButton[] = [{ text: 'Через 1 час', callback_data: scheduleDataOf(token, 'h1') }];
  if (options.evening) quick.push({ text: 'Сегодня 19:00', callback_data: scheduleDataOf(token, 't19') });
  return {
    inline_keyboard: [
      quick,
      [
        { text: 'Завтра 10:00', callback_data: scheduleDataOf(token, 'm10') },
        { text: 'Своё время', callback_data: scheduleDataOf(token, 'own') }
      ],
      [{ text: '← Назад', callback_data: scheduleDataOf(token, 'back') }]
    ]
  };
}
