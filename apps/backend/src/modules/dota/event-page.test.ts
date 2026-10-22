import { describe, expect, it } from 'vitest';
import {
  bundleUrls,
  chunkHash,
  decodeJsString,
  eventPageSlugs,
  pageChunkIds,
  parseMediaPaths,
  parseTextsChunk,
  parseTreasure
} from './event-page';

// Shapes as dota2.com served them on 21–22.10.2026 (minified names differ per build; only these shapes are relied on).
const MAIN = [
  '"./darkcarnival_english.json":[50518,50518],"./darkcarnival_russian.json":[66403,66403],',
  '"./patch738_russian.json":[11111,11111],',
  'darkcarnival:()=>"/darkcarnival",patch738:()=>"/wanderingwaters",',
  '(0,e.jsx)(Fe,{path:G.J.darkcarnival(),component:cb}),(0,e.jsx)(Fe,{path:G.J.other(),component:db})',
  ',(0,e.jsx)(Fe,{path:G.J.patch738(),component:ub})',
  ',cb=o.lazy(()=>x.e(57237).then(x.bind(x,57237))),db=o.lazy(()=>x.e(79630).then(x.bind(x,79630)))',
  ',ub=o.lazy(()=>x.e(7937).then(x.bind(x,7937)))'
].join('');
const MANIFEST =
  'u=e=>"javascript/dota_react/"+e+".js?contenthash="+{393:"5c39f56bbe80c5c850e4",57237:"62627da7cfcec19f8634",66403:"d400164f1b61b62f9f00"}[e];c={57237:"ffffffffffffffffffff"}';

describe('event page', () => {
  it('finds the event pages an announcement links to, not other site sections', () => {
    const raw =
      '[url=http://dota2.com/darkcarnival]the Dark Carnival[/url], https://www.dota2.com/newsentry/1, ' +
      'http://dota2.com/darkcarnival again, <a href="https://www.dota2.com/patches/7.41">';
    expect(eventPageSlugs(raw)).toEqual(['darkcarnival']);
  });

  it('follows the bundle to the page code and its Russian texts', () => {
    const html =
      '<script src="https://www.dota2.com/public/javascript/dota_react/main.js?v=K0KE9f72Ct4H&amp;l=english"></script><script src="https://www.dota2.com/public/javascript/dota_react/manifest.js?v=ssMDUouWT2xU&amp;l=english">';
    expect(bundleUrls(html)).toEqual({
      main: 'https://www.dota2.com/public/javascript/dota_react/main.js?v=K0KE9f72Ct4H&l=english',
      manifest: 'https://www.dota2.com/public/javascript/dota_react/manifest.js?v=ssMDUouWT2xU&l=english'
    });
    expect(pageChunkIds(MAIN, 'darkcarnival', 'russian')).toEqual({
      page: 57237,
      texts: 66403,
      route: 'darkcarnival'
    });
    // The app's own name for a page that is not its address.
    expect(pageChunkIds(MAIN, 'wanderingwaters', 'russian')).toEqual({ page: 7937, texts: 11111, route: 'patch738' });
    expect(pageChunkIds(MAIN, 'largo', 'russian')).toEqual({ page: null, texts: null, route: 'largo' });
    expect(chunkHash(MANIFEST, 57237)).toBe('62627da7cfcec19f8634');
    expect(chunkHash(MANIFEST, 1)).toBeNull();
  });

  it('reads the texts without evaluating anything: escapes decoded, markup and the comic dropped', () => {
    expect(decodeJsString("\\xAB\\u0422\\u0451\\u043C\\u043D\\u044B\\u0439\\xBB \\'ok\\' \\\\n")).toBe(
      "«Тёмный» 'ok' \\n"
    );
    const chunk =
      "(self.webpackChunk=self.webpackChunk||[]).push([[66403],{66403:(a=>{a.exports=JSON.parse('" +
      '{"language":"russian","darkcarnival_title":"\\u0422\\u0451\\u043C\\u043D\\u044B\\u0439 \\u043A\\u0430\\u0440\\u043D\\u0430\\u0432\\u0430\\u043B",' +
      '"darkcarnivalcomic_title":"x","darkcarnival_intro":"<b>\\u0418\\u0433\\u0440\\u0430\\u0439\\u0442\\u0435</b> [strike]\\u0432[/strike] %1$s"}' +
      "')})}]);";
    expect(parseTextsChunk(chunk, 'darkcarnival')).toEqual({
      texts: [
        { key: 'darkcarnival_title', text: 'Тёмный карнавал' },
        { key: 'darkcarnival_intro', text: 'Играйте в …' }
      ],
      truncated: false
    });
    // Other builds (largo, crownfall) emit a template literal, where an apostrophe is not escaped.
    const backtick =
      's.exports=JSON.parse(`{"language":"russian","largo_title":"Largo \\u2014 it\'s new","largo_sub":"\\u0438"}`)';
    expect(parseTextsChunk(backtick, 'largo').texts).toEqual([
      { key: 'largo_title', text: "Largo — it's new" },
      { key: 'largo_sub', text: 'и' }
    ]);
    expect(parseTextsChunk('no json here', 'darkcarnival')).toEqual({ texts: [], truncated: false });
  });

  it('takes the page media, joining bare names to the one folder the code fills in, without decoration', () => {
    const chunk =
      'image:"darkcarnival/overworld/reward_treasure.png",bg:"darkcarnival/header/clouds.png",reel:"darkcarnival/dc_event_reel.webm",' +
      'image:`darkcarnival/automatons/${n.portrait}`,video:`darkcarnival/automatons/${n.gameplayVideo}`,' +
      'portrait:"axe/npc_dota_hero_axe_carnival.png",icon:"axe/npc_dota_hero_axe_carnival_icon.png",gameplayVideo:"axe_automaton_gameplay.mp4",' +
      'evil:"../../etc.png"';
    expect(parseMediaPaths(chunk, ['darkcarnival'])).toEqual({
      images: [
        'https://cdn.steamstatic.com/apps/dota2/images/dota_react/darkcarnival/overworld/reward_treasure.png',
        'https://cdn.steamstatic.com/apps/dota2/images/dota_react/darkcarnival/automatons/axe/npc_dota_hero_axe_carnival.png'
      ],
      videos: [
        'https://cdn.steamstatic.com/apps/dota2/videos/dota_react/darkcarnival/automatons/axe_automaton_gameplay.mp4'
      ]
    });
  });

  // The rarest set is the last slide (owner, 22.10.2026), so the slider's order is kept, not the texts' order.
  const VIDEO = 'https://cdn.steamstatic.com/apps/dota2/videos/dota_react/';
  const slide = (folder: string) =>
    `(0,a.jsx)("img",{className:e().TreasureVideo,src:\`\${t.r.VIDEO_URL}/${folder}/\${l}.png\`})`;
  const texts = (pairs: [string, string][]) => pairs.map(([key, text]) => ({ key, text }));
  it.each([
    {
      shape: 'slides written out (largo)',
      chunk:
        slide('treasures_winter2025') +
        '(y,{index:1,video:"set_tiny",name:"#largo_treasure_hero_tiny_set",heroname:"#largo_treasure_hero_tiny",autoplay:!1})' +
        '(y,{index:0,video:"set_shadowfiend",name:"#largo_treasure_hero_shadow_fiend_set",heroname:"#largo_treasure_hero_shadow_fiend",autoplay:!1})',
      texts: texts([
        ['largo_treasure_hero_tiny', 'Tiny'],
        ['largo_treasure_hero_tiny_set', 'Stone Giant Stronghold'],
        ['largo_treasure_hero_shadow_fiend', 'Shadow Fiend'],
        ['largo_treasure_hero_shadow_fiend_set', 'Soul Reaver']
      ]),
      sets: [
        { hero: 'Shadow Fiend', set: 'Soul Reaver', image: `${VIDEO}treasures_winter2025/set_shadowfiend.png` },
        { hero: 'Tiny', set: 'Stone Giant Stronghold', image: `${VIDEO}treasures_winter2025/set_tiny.png` }
      ],
      orderKnown: true
    },
    {
      shape: 'a map over hero names (darkcarnival)',
      chunk:
        'v=[{heroname:"pudge"},{heroname:"io"}],w=[{heroname:"axe"}],' +
        slide('darkcarnival/treasure') +
        '(C,{index:m,video:`set_${d.heroname}`,name:`#darkcarnival_treasure_${d.heroname}_set`,heroname:`#darkcarnival_treasure_${d.heroname}`,autoplay:!0})',
      texts: texts([
        ['darkcarnival_treasure_io', 'Io'],
        ['darkcarnival_treasure_io_set', 'Madame Scrio'],
        ['darkcarnival_treasure_pudge', 'Pudge'],
        ['darkcarnival_treasure_pudge_set', 'The Woodcutter']
      ]),
      sets: [
        { hero: 'Pudge', set: 'The Woodcutter', image: `${VIDEO}darkcarnival/treasure/set_pudge.png` },
        { hero: 'Io', set: 'Madame Scrio', image: `${VIDEO}darkcarnival/treasure/set_io.png` }
      ],
      orderKnown: true
    },
    {
      shape: 'a map over a count (crownfall)',
      chunk:
        slide('crownfall') +
        '(E,{index:t,video:`treasure_item_${t}`,name:`#crownfall_treasure_item_${t}_name`,heroname:`#crownfall_treasure_item_${t}_hero`,subtext:`#x`})',
      texts: texts([
        ['crownfall_treasure_item_0_name', 'Set A'],
        ['crownfall_treasure_item_0_hero', 'Hero A'],
        ['crownfall_treasure_item_1_name', 'Set B']
      ]),
      sets: [
        { hero: 'Hero A', set: 'Set A', image: `${VIDEO}crownfall/treasure_item_0.png` },
        { hero: '', set: 'Set B', image: `${VIDEO}crownfall/treasure_item_1.png` }
      ],
      orderKnown: true
    },
    {
      shape: 'no slider: pairs from the texts, rarity unknown',
      chunk: 'nothing',
      texts: texts([
        ['x_treasure_hero_luna', 'Luna'],
        ['x_treasure_hero_luna_set', 'Moonfall'],
        ['x_title', 'Title']
      ]),
      sets: [{ hero: 'Luna', set: 'Moonfall', image: null }],
      orderKnown: false
    }
  ])('reads the treasure from $shape', ({ chunk, texts: pageTexts, sets, orderKnown }) => {
    expect(parseTreasure(chunk, pageTexts)).toEqual({ sets, orderKnown });
  });
});
