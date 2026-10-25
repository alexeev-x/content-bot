// HTML pages a browser turns into a rubric's picture (owner, 25.10.2026: heroes and items must not be distorted).
// Every hero, item, ability and rank medal is Valve's or OpenDota's own image, placed by layout; the words are real
// text in a font. The look follows the owner's references (design-refs/rubric-style): serif metal titles, a red word,
// the small «ALEXEEV» mark on top (never «studio»). `--bg` takes a drawn background; without it a dark plain one.

export const PICTURE_SIZE = { width: 1536, height: 768 } as const;

const CDN = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);

const imageKey = (key: string) => (/^[a-z0-9_]{1,80}$/.test(key) ? key : 'default');

/** `npc_dota_hero_juggernaut` → Valve's 256×144 portrait. */
export const heroImage = (heroName: string) => `${CDN}/heroes/${imageKey(heroName.replace(/^npc_dota_hero_/, ''))}.png`;
export const itemImage = (itemKey: string) => `${CDN}/items/${imageKey(itemKey)}.png`;
export const abilityImage = (abilityKey: string) => `${CDN}/abilities/${imageKey(abilityKey)}.png`;
export const rankMedalImage = (bracket: number) =>
  `https://www.opendota.com/assets/images/dota2/rank_icons/rank_icon_${Math.min(Math.max(Math.trunc(bracket), 1), 8)}.png`;

export function picturePage(body: string, extraCss = ''): string {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;800;900&amp;family=Playfair+Display+SC:wght@900&amp;display=block&amp;subset=cyrillic" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${PICTURE_SIZE.width}px;height:${PICTURE_SIZE.height}px;overflow:hidden}
body{font-family:Montserrat,Arial,sans-serif;color:#f3eee6;
background:var(--bg,radial-gradient(ellipse at 50% 0%,#5a1712 0%,#1c0d0b 55%,#0b0807 100%));position:relative;
display:flex;flex-direction:column;align-items:center;padding:40px 64px 32px}
.title{font-family:'Playfair Display SC',Georgia,serif;font-weight:900;font-size:68px;letter-spacing:1px;
text-transform:uppercase;text-align:center;line-height:1.05;color:#ece4d8;
background:linear-gradient(180deg,#fbf6ee 0%,#d9cdbb 55%,#9c8f7d 100%);-webkit-background-clip:text;background-clip:text;
-webkit-text-fill-color:transparent;filter:drop-shadow(0 4px 10px rgba(0,0,0,.85))}
.title b{background:linear-gradient(180deg,#ff6a4a 0%,#d62a1c 55%,#8e140c 100%);-webkit-background-clip:text;background-clip:text}
.sub{font-weight:600;font-size:28px;color:#cbbfae;margin-top:10px;text-align:center}
.portrait{display:block;width:256px;height:144px;border-radius:10px;border:3px solid #7a5a32;
box-shadow:0 0 0 1px #140d09,0 0 22px rgba(214,42,28,.28),0 10px 30px rgba(0,0,0,.6);object-fit:cover}
.item{display:block;width:88px;height:64px;border-radius:6px;border:2px solid #7a5a32;box-shadow:0 6px 14px rgba(0,0,0,.5)}
.main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;padding-bottom:12px}
.mark{position:absolute;top:14px;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:16px;
font-weight:800;font-size:15px;letter-spacing:8px;color:#a39686}
.mark::before,.mark::after{content:'';width:90px;height:1px;background:linear-gradient(90deg,transparent,#a3968680,transparent)}
${extraCss}
</style></head><body><div class="mark">ALEXEEV</div><main class="main">${body}</main></body></html>`;
}

const plainText = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** The page's title as words and its red part (`<b>`), for the model to letter; null when the page has none. */
export function pictureHeading(html: string): { text: string; red: string | null } | null {
  const title = /<div class="title">([\s\S]*?)<\/div>/.exec(html)?.[1];
  if (title === undefined) return null;
  const red = /<b>([\s\S]*?)<\/b>/.exec(title)?.[1];
  return { text: plainText(title), red: red === undefined ? null : plainText(red) };
}

/**
 * The page over a drawn background (base64 JPEG), slightly darkened so the icons on it read well. The drawn picture
 * carries the title and the mark (variant A), so the page hides its own and keeps their room.
 */
export function withBackground(html: string, base64: string): string {
  if (!/^[A-Za-z0-9+/=]+$/.test(base64)) return html;
  const style = `<style>:root{--bg:linear-gradient(rgba(8,6,5,.2),rgba(8,6,5,.2)),url(data:image/jpeg;base64,${base64}) center/cover no-repeat}.title,.mark{visibility:hidden}</style>`;
  return html.replace('</head>', `${style}</head>`);
}
