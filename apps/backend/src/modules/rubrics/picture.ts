// HTML pages a browser turns into a rubric's picture (owner, 25.10.2026: heroes and items must not be distorted).
// Every hero, item, ability and rank medal is Valve's or OpenDota's own image, placed by layout; the words are real
// text in a font. The look follows Riot's patch graphics in Dota's colours (owner, 26.10.2026): a flat dark background,
// a modern sans title with one red word, a red bar on the left, no gold frames. `--bg` takes a drawn background.

export const PICTURE_SIZE = { width: 1536, height: 768 } as const;

const CDN = 'https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);

const imageKey = (key: string) => (/^[a-z0-9_]{1,80}$/.test(key) ? key : 'default');

/** `npc_dota_hero_juggernaut` → Valve's 400×250 portrait crop, sharper than the 256×144 one when shown large. */
export const heroImage = (heroName: string) =>
  `${CDN}/heroes/crops/${imageKey(heroName.replace(/^npc_dota_hero_/, ''))}.png`;
/** Valve's 256×144 portrait with its own painted background. */
export const heroPortraitImage = (heroName: string) =>
  `${CDN}/heroes/${imageKey(heroName.replace(/^npc_dota_hero_/, ''))}.png`;
export const itemImage = (itemKey: string) => `${CDN}/items/${imageKey(itemKey)}.png`;
export const abilityImage = (abilityKey: string) => `${CDN}/abilities/${imageKey(abilityKey)}.png`;
export const rankMedalImage = (bracket: number) =>
  `https://www.opendota.com/assets/images/dota2/rank_icons/rank_icon_${Math.min(Math.max(Math.trunc(bracket), 1), 8)}.png`;

export function picturePage(body: string, extraCss = ''): string {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@600;800&amp;family=Unbounded:wght@700;900&amp;display=block&amp;subset=cyrillic" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--panel:#131820;--line:rgba(255,255,255,.08);--red:#d63a22;--good:#6fbf5a;--text:#f1ebe0;--muted:#8a929e;
--tier-s:#d63a22;--tier-a:#e08a2c;--tier-b:#d6b84a;--tier-c:#5e6a78;--tier-d:#3d4450}
html,body{width:${PICTURE_SIZE.width}px;height:${PICTURE_SIZE.height}px;overflow:hidden}
body{font-family:Manrope,Arial,sans-serif;color:var(--text);position:relative;
background:var(--bg,radial-gradient(ellipse 70% 90% at 100% 0%,#1a2029 0%,transparent 60%),
radial-gradient(ellipse 50% 60% at 0% 100%,rgba(214,58,34,.16) 0%,transparent 70%),#0b0e13);
display:flex;flex-direction:column;align-items:center;padding:60px 72px 40px 82px}
body::before{content:'';position:absolute;inset:0;pointer-events:none;
background:repeating-linear-gradient(135deg,rgba(255,255,255,.018) 0 2px,transparent 2px 14px)}
body::after{content:'';position:absolute;left:0;top:0;bottom:0;width:10px;background:var(--red)}
.title{align-self:flex-start;margin-bottom:auto;font-family:Unbounded,Arial,sans-serif;font-weight:900;font-size:60px;letter-spacing:-1px;
text-transform:uppercase;line-height:1.05;color:var(--text)}
.title b{color:var(--red)}
.title::after{content:'';display:block;width:120px;height:3px;background:var(--red);margin-top:18px}
.vs,.q,.place,.nums,.total,.plus,.on,.label,.tiers span{font-family:Unbounded,Arial,sans-serif}
.sub{font-weight:600;font-size:28px;color:var(--muted);margin-top:10px;text-align:center}
.portrait{display:block;width:256px;height:144px;border-radius:8px;border:1px solid var(--line);
box-shadow:0 14px 30px rgba(0,0,0,.55);object-fit:cover}
.item{display:block;width:88px;height:64px;border-radius:8px;border:1px solid var(--line);box-shadow:0 8px 18px rgba(0,0,0,.5)}
.plate{position:absolute;top:60px;right:72px;display:flex;align-items:center;gap:14px;border-radius:8px;
border:1px solid var(--line);background:var(--panel);padding:10px 22px;font-weight:800;font-size:30px}
.plate small{font-size:14px;letter-spacing:4px;color:var(--muted)}
.main{flex:1;display:flex;flex-direction:column;align-items:center;width:100%;padding-bottom:12px}
/* The title sits on top; the auto margins centre the rest in the room below it. */
.main::after{content:'';margin-top:auto}
.mark{position:absolute;top:30px;left:82px;font-weight:800;font-size:15px;letter-spacing:7px;color:var(--muted)}
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

/** A rubric with no layout of its own: its title alone, the last word red, for the drawn scene to letter. */
export function titlePicture(title: string): { html: string; width: number; height: number } {
  const words = title.split(' ');
  const last = words.pop() ?? '';
  const head = words.length === 0 ? '' : `${escapeHtml(words.join(' '))} `;
  return { html: picturePage(`<div class="title">${head}<b>${escapeHtml(last)}</b></div>`), ...PICTURE_SIZE };
}
