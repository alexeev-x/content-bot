// HTML pages a browser turns into a rubric's picture (owner, 25.10.2026: heroes and items must not be distorted).
// Every hero, item, ability and rank medal is Valve's or OpenDota's own image, placed by layout; the words are real
// text in a font. The owner's templates will later replace the plain background.

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
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;800;900&amp;display=block&amp;subset=cyrillic" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${PICTURE_SIZE.width}px;height:${PICTURE_SIZE.height}px;overflow:hidden}
body{font-family:Montserrat,Arial,sans-serif;color:#f3eee6;
background:radial-gradient(ellipse at 50% 0%,#5a1712 0%,#1c0d0b 55%,#0b0807 100%);
display:flex;flex-direction:column;align-items:center;padding:40px 64px 32px}
.title{font-weight:900;font-size:68px;letter-spacing:1px;text-transform:uppercase;text-align:center;
text-shadow:0 4px 18px rgba(0,0,0,.6)}
.title b{color:#e8b04a}
.sub{font-weight:600;font-size:28px;color:#cbbfae;margin-top:10px;text-align:center}
.portrait{display:block;width:256px;height:144px;border-radius:10px;border:3px solid #3a2a20;
box-shadow:0 10px 30px rgba(0,0,0,.55);object-fit:cover}
.item{display:block;width:88px;height:64px;border-radius:6px;border:2px solid #3a2a20;box-shadow:0 6px 14px rgba(0,0,0,.5)}
.main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;padding-bottom:12px}
.footer{font-weight:800;font-size:24px;color:#8f8173;letter-spacing:3px}
${extraCss}
</style></head><body><main class="main">${body}</main><div class="footer">@ALEXEEV_X</div></body></html>`;
}
