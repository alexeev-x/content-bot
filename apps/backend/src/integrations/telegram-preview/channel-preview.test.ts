import { describe, expect, it } from 'vitest';
import { fetchChannelHistory, parseChannelPreview, parseCompactCount } from './channel-preview';

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
        hashtags: [],
        publishedAt: Date.parse('2026-10-08T16:01:58Z'),
        views: 12_500,
        reactions: 1108,
        thumbnailUrl: 'https://cdn4.telesco.pe/file/abc'
      },
      {
        messageId: 662,
        text: '',
        hashtags: [],
        publishedAt: Date.parse('2026-10-09T10:00:00Z'),
        views: 37,
        reactions: null,
        thumbnailUrl: null
      }
    ]);
  });
  it('reads a reply by its own text, not the quoted post (QA, 20.10.2026: t.me/s puts the quote first)', async () => {
    const page = `<div class="tgme_widget_message" data-post="alexeev_x/8">
      <a class="tgme_widget_message_reply"><div class="tgme_widget_message_text js-message_reply_text">Вердикт чата: кто прав?</div></a>
      <div class="tgme_widget_message_text js-message_text">Ответ на вердикт <a href="?q=%23dota">#dota</a></div>
      <a class="tgme_widget_message_date"><time datetime="2026-10-09T10:00:00+00:00"></time></a></div>`;
    const [post] = (await parseChannelPreview(page, 'alexeev_x')).posts;
    expect(post?.text).toBe('Ответ на вердикт #dota');
    expect(post?.hashtags).toEqual(['dota']);
  });
  it('reads the hashtags of the whole post, past the text cut (plan B3: a rubric tag closes a long post)', async () => {
    const long = 'слово '.repeat(120);
    const page = `<div class="tgme_widget_message" data-post="alexeev_x/7">
      <div class="tgme_widget_message_text">${long}<a href="?q=%23%D0%92%D0%B5%D1%80%D0%B4%D0%B8%D0%BA%D1%82">#Вердикт</a> <a href="?q=%23dota">#dota</a> <a href="?q=%23dota">#dota</a> <a href="https://t.me/x">#не_тег</a></div>
      <span class="tgme_widget_message_views">5</span>
      <a class="tgme_widget_message_date"><time datetime="2026-10-09T10:00:00+00:00"></time></a></div>`;
    const [post] = (await parseChannelPreview(page, 'alexeev_x')).posts;
    expect(post?.text.length).toBeLessThan(long.length);
    expect(post?.hashtags).toEqual(['вердикт', 'dota']);
  });
});

describe('fetchChannelHistory', () => {
  const page = (ids: number[]) =>
    ids
      .map(
        (id) => `<div class="tgme_widget_message" data-post="alexeev_x/${id}">
          <span class="tgme_widget_message_views">${id}</span>
          <a class="tgme_widget_message_date"><time datetime="2026-10-0${(id % 9) + 1}T10:00:00+00:00"></time></a></div>`
      )
      .join('');

  it('walks older pages with ?before= and keeps what it read when an older page fails', async () => {
    const urls: string[] = [];
    const fake = (async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.endsWith('/s/alexeev_x')) return new Response(page([5, 6]));
      if (url.endsWith('?before=5')) return new Response(page([3, 4]));
      return new Response('', { status: 500 });
    }) as typeof fetch;

    const history = await fetchChannelHistory('alexeev_x', fake, 5);

    expect(history.posts.map((post) => post.messageId)).toEqual([5, 6, 3, 4]);
    expect(history.partial).toBe('PREVIEW_HTTP');
    expect(urls).toEqual([
      'https://t.me/s/alexeev_x',
      'https://t.me/s/alexeev_x?before=5',
      'https://t.me/s/alexeev_x?before=3'
    ]);
  });
});
