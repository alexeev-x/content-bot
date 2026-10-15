import { describe, expect, it } from 'vitest';
import { parseChannelPreview, parseCompactCount } from './channel-preview';

// Trimmed from the real markup of https://t.me/s/<channel> (14.10.2026).
const PAGE = `
<div class="tgme_channel_info_counters">
  <div class="tgme_channel_info_counter"><span class="counter_value">1.2K</span> <span class="counter_type">subscribers</span></div>
  <div class="tgme_channel_info_counter"><span class="counter_value">410</span> <span class="counter_type">photos</span></div>
</div>
<div class="tgme_widget_message_wrap"><div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="alexeev_x/661">
  <a class="tgme_widget_message_photo_wrap 1 2" href="https://t.me/alexeev_x/661" style="width:800px;background-image:url('https://cdn4.telesco.pe/file/abc')"></a>
  <div class="tgme_widget_message_text js-message_text" dir="auto"><b>Учу</b> фидить &amp; побеждать<br/>вторая строка</div>
  <div class="tgme_widget_message_reactions"><span class="tgme_reaction"><tg-emoji emoji-id="1"></tg-emoji>8</span><span class="tgme_reaction"><i class="emoji"><b>👍</b></i>1.1K</span></div>
  <div class="tgme_widget_message_footer"><span class="tgme_widget_message_views">12.5K</span>
  <a class="tgme_widget_message_date" href="https://t.me/alexeev_x/661"><time datetime="2026-10-08T16:01:58+00:00" class="time">16:01</time></a></div>
</div></div>
<div class="tgme_widget_message_wrap"><div class="tgme_widget_message js-widget_message" data-post="alexeev_x/662">
  <div class="tgme_widget_message_footer"><span class="tgme_widget_message_views">37</span>
  <a class="tgme_widget_message_date" href="https://t.me/alexeev_x/662"><time datetime="2026-10-09T10:00:00+00:00" class="time">10:00</time></a></div>
</div></div>
<div class="tgme_widget_message_wrap"><div class="tgme_widget_message js-widget_message" data-post="other/1">
  <a class="tgme_widget_message_date"><time datetime="2026-10-09T10:00:00+00:00">x</time></a>
</div></div>`;

describe('parseCompactCount', () => {
  it.each([
    ['836', 836],
    ['1.2K', 1200],
    ['3,4M', 3_400_000],
    ['', null],
    ['n/a', null]
  ])('%s → %s', (raw, expected) => {
    expect(parseCompactCount(raw)).toBe(expected);
  });
});

describe('parseChannelPreview', () => {
  it('reads subscribers and every post of the channel, skipping foreign posts', async () => {
    const preview = await parseChannelPreview(PAGE, 'alexeev_x');

    expect(preview.subscribers).toBe(1200);
    expect(preview.posts).toEqual([
      {
        messageId: 661,
        text: 'Учу фидить & побеждать\nвторая строка',
        publishedAt: Date.parse('2026-10-08T16:01:58Z'),
        views: 12_500,
        reactions: 1108,
        thumbnailUrl: 'https://cdn4.telesco.pe/file/abc'
      },
      {
        messageId: 662,
        text: '',
        publishedAt: Date.parse('2026-10-09T10:00:00Z'),
        views: 37,
        reactions: null,
        thumbnailUrl: null
      }
    ]);
  });
});
