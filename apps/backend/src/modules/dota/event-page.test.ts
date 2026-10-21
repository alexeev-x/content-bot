import { describe, expect, it } from 'vitest';
import {
  bundleUrls,
  chunkHash,
  decodeJsString,
  eventPageSlugs,
  pageChunkIds,
  parseMediaPaths,
  parseTextsChunk
} from './event-page';

// Shapes as dota2.com served them on 21.10.2026 (minified names differ per build; only these shapes are relied on).
const MAIN = [
  '"./darkcarnival_english.json":[50518,50518],"./darkcarnival_russian.json":[66403,66403],',
  '(0,e.jsx)(Fe,{path:G.J.darkcarnival(),component:cb}),(0,e.jsx)(Fe,{path:G.J.other(),component:db})',
  ',cb=o.lazy(()=>x.e(57237).then(x.bind(x,57237))),db=o.lazy(()=>x.e(79630).then(x.bind(x,79630)))'
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
    expect(pageChunkIds(MAIN, 'darkcarnival', 'russian')).toEqual({ page: 57237, texts: 66403 });
    expect(pageChunkIds(MAIN, 'largo', 'russian')).toEqual({ page: null, texts: null });
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
    expect(parseTextsChunk(chunk, 'darkcarnival')).toEqual([
      { key: 'darkcarnival_title', text: 'Тёмный карнавал' },
      { key: 'darkcarnival_intro', text: 'Играйте в …' }
    ]);
    expect(parseTextsChunk('no json here', 'darkcarnival')).toEqual([]);
  });

  it('takes the page media, joining bare names to the one folder the code fills in, without decoration', () => {
    const chunk =
      'image:"darkcarnival/overworld/reward_treasure.png",bg:"darkcarnival/header/clouds.png",reel:"darkcarnival/dc_event_reel.webm",' +
      'image:`darkcarnival/automatons/${n.portrait}`,video:`darkcarnival/automatons/${n.gameplayVideo}`,' +
      'portrait:"axe/npc_dota_hero_axe_carnival.png",icon:"axe/npc_dota_hero_axe_carnival_icon.png",gameplayVideo:"axe_automaton_gameplay.mp4",' +
      'evil:"../../etc.png"';
    expect(parseMediaPaths(chunk, 'darkcarnival')).toEqual({
      images: [
        'https://cdn.steamstatic.com/apps/dota2/images/dota_react/darkcarnival/overworld/reward_treasure.png',
        'https://cdn.steamstatic.com/apps/dota2/images/dota_react/darkcarnival/automatons/axe/npc_dota_hero_axe_carnival.png'
      ],
      videos: [
        'https://cdn.steamstatic.com/apps/dota2/videos/dota_react/darkcarnival/automatons/axe_automaton_gameplay.mp4'
      ]
    });
  });
});
