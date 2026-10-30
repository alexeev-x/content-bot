import { escapeHtml, PICTURE_SIZE, picturePage } from './picture';
import { LEAK_EGGS } from './leak-eggs';
import { noData, pick, plural, poll, type RubricContext, type RubricSample, shuffled, withJoke } from './types';

// Rubrics over what Valve and the community put out (game files, announcements, the Workshop) and the fun ones whose
// material will come from banks the owner approves; the samples carry a few examples of such a bank.

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// «Утечка недели»'s picture is drawn before the writer picks its detail, so it shows the case, never the verdict: the
// week's builds and dates, how many finds, and each find's post as redaction bars of its real line lengths; the folders
// named are the ones the game-files watch reads. Detective mood (owner, 26.10.2026: «мы как Шерлок Холмс, пронюхали»).
// Three looks the owner chose of seven (26.10.2026), at random, each unlike rubrics 1–4: 'A' a case folder, 'C' a code
// window, 'E' a file explorer.
const LEAK_LOOKS = ['A', 'C', 'E'] as const;
type LeakLook = (typeof LEAK_LOOKS)[number];

/** An egg as a file name: «БКБ ДЛЯ ЛОХОВ» → `бкб_для_лохов.txt`. */
const eggFile = (egg: string, ext = '') =>
  `${egg
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/gu, '')}${ext === '' ? '' : `.${ext}`}`;

// Kinds of files Dota really ships, so an egg passes for one more file of the leak (owner, 26.10.2026: «как будто тут
// два файла таких»); the same egg always gets the same one.
const EGG_EXTS = ['txt', 'cfg', 'kv3', 'lua', 'vpk', 'vmdl_c'] as const;

/** An egg as a file with an extension: «РЕПОРТ НАХУЙ ВСЕМ» → `репорт_нахуй_всем.txt`. */
const eggFileName = (egg: string) =>
  eggFile(egg, EGG_EXTS[[...egg].reduce((sum, char) => sum + (char.codePointAt(0) ?? 0), 0) % EGG_EXTS.length]);

/** A look's three places for an egg: two hold one, the third stays empty, which one changes from post to post. */
type Slots = readonly (string | undefined)[];

/** An egg's markup, or nothing when this picture has fewer eggs than the look has slots. */
const egged = (egg: string | undefined, html: (egg: string) => string) => (egg === undefined ? '' : html(egg));

interface LeakCase {
  build: string;
  at: number;
  day: string;
  text: string;
}

const dayMonth = (at: number) => new Date(at).toISOString().slice(5, 10).split('-').reverse().join('.');

/** One redacted line: its length as a share of the column, and its first word, left in the clear. */
interface Redacted {
  share: number;
  lead: string;
}

/**
 * A find's text wrapped at `width` characters: one bar per line, its length the line's share of the width, with the
 * line's first word (owner, 26.10.2026: «приоткрыть»): «Terrorblade ███ ██» teases without telling.
 */
function redaction(text: string, width: number, max: number): Redacted[] {
  const bars: Redacted[] = [];
  for (const paragraph of text.split('\n')) {
    let line = 0;
    let lead = '';
    for (const word of paragraph.split(/\s+/u).filter((each) => each !== '')) {
      if (line > 0 && line + 1 + word.length > width) {
        bars.push({ share: line / width, lead });
        line = 0;
      }
      // The telling word of the line: a Latin name (a hero, an item, a file) or a capitalised name inside the line;
      // a line with none stays wholly blacked out («появились», «В» tell nothing).
      const clean = word.replace(/^[«»"„“(]+|[«»"„“.,:;!?)]+$/gu, '');
      const named = /[A-Za-z]{3}/u.test(clean) || (line > 0 && /^\p{Lu}\p{Ll}{3}/u.test(clean));
      if (line === 0) lead = '';
      if (lead === '' && named) lead = clean.slice(0, 16);
      line = line === 0 ? Math.min(word.length, width) : line + 1 + word.length;
    }
    if (line > 0) bars.push({ share: line / width, lead });
  }
  return (bars.length === 0 ? [{ share: 0.6, lead: '' }] : bars)
    .slice(0, max)
    .map((bar) => ({ ...bar, share: Math.max(0.16, Math.min(1, bar.share)) }));
}

/** Bars filling about `count` lines: the text set in a column as narrow as that takes, at most `widest` characters. */
function filled(text: string, widest: number, count: number): Redacted[] {
  const chars = text.replace(/\s+/gu, ' ').length;
  return redaction(text, Math.max(12, Math.min(widest, Math.ceil(chars / count) + 6)), count);
}

/**
 * The lines blacked out, only the first word of the first line in the clear (owner, 26.10.2026: «не будет слишком много
 * текста?»). With `egg`, the middle line leaks a file of its own, set like the first line («репорт_нахуй_всем.txt ███»).
 */
const barsHtml = (lines: Redacted[], egg?: string) =>
  lines
    .map((line, index) =>
      egg !== undefined && index === Math.floor(lines.length / 2)
        ? `<span class="ln"><em>${escapeHtml(eggFileName(egg))}</em><i style="width:${Math.round(line.share * 100)}%"></i></span>`
        : `<span class="ln">${index > 0 || line.lead === '' ? '' : `<em>${escapeHtml(line.lead)}</em>`}<i style="width:${Math.round(line.share * 100)}%"></i></span>`
    )
    .join('');

/** How many bars of `height` with gaps of `gap` fit `room`. */
const barsIn = (room: number, height: number, gap: number) => Math.max(1, Math.floor((room + gap) / (height + gap)));

const LEAK_BASE = `body{display:block;padding:0;background:#0c0d0f}body::before,body::after{content:none}
.main{position:absolute;inset:0;display:block;padding:0}.main::after{content:none}
.mark{top:40px;left:72px;color:#6b6f76;z-index:5}
.title{position:absolute;left:72px;top:76px;margin:0;z-index:2;font-size:104px;line-height:.98;letter-spacing:-.01em;
text-transform:uppercase;white-space:nowrap}.title::after{content:none}
.num{font-family:Tektur,sans-serif;font-weight:800;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:0}
.stamp{position:absolute;z-index:4;font-family:Tektur,sans-serif;font-weight:800;line-height:1;color:var(--red);
text-transform:uppercase;white-space:nowrap;border:4px solid var(--red);border-radius:8px;padding:.22em .4em .16em;
transform:rotate(-6deg)}
.bars{display:flex;flex-direction:column;gap:var(--gap)}.bars i{display:block;flex:1;height:var(--bh);background:#050607;border-radius:2px}
.bars .ln{display:flex;align-items:center;gap:.4em}.bars em{font-style:normal;font-weight:800;font-size:calc(var(--bh) * 1.1);line-height:1;color:#c9c2b6;white-space:nowrap}
.muted{color:#8a929e}
.egg{font-weight:800;font-size:20px;line-height:1.2;white-space:nowrap;color:#8a929e}`;

const LEAK_CSS: Record<LeakLook, string> = {
  // A: the house look of «Кого понерфили»: a big caps title and the count on the left, the case folder on the right.
  A: `.title{top:84px;font-size:112px}
.count{position:absolute;left:72px;bottom:64px;display:flex;flex-direction:column;gap:14px}
.count .line{display:flex;align-items:baseline;gap:18px}.count .num{font-size:150px}
.count .w{font-weight:800;font-size:44px}.count .week{font-weight:600;font-size:28px}
.tabs{position:absolute;left:660px;top:64px;display:flex;align-items:flex-end;gap:6px}
.tab{height:56px;padding:0 28px;display:flex;align-items:center;border-radius:10px 10px 0 0;background:#1b1f25;
font-weight:800;font-size:24px;color:#8a929e}
.tab.egg{height:42px;padding:0 20px;background:#15181d;font-size:20px}
.folder{position:absolute;left:660px;right:72px;top:120px;bottom:64px;background:#1b1f25;border-radius:0 10px 10px 10px;
padding:24px 44px 48px;display:flex;flex-direction:column}
.foot{position:absolute;left:44px;right:44px;bottom:14px;display:flex;justify-content:space-between;gap:24px}
.row{flex:1;display:grid;grid-template-columns:var(--numw) 104px minmax(0,1fr);column-gap:24px;align-items:center;
border-top:1px solid rgba(255,255,255,.08)}.row:first-child{border-top:0}
.row .num{font-size:var(--num);color:#f1ebe0}.row .day{font-weight:800;font-size:26px;color:#8a929e}
.row .bars{padding:12px 0}
.single .row{grid-template-columns:auto minmax(0,1fr);grid-template-rows:auto 1fr;align-items:end;row-gap:32px;padding-top:16px}
.single .row .bars{grid-column:1 / -1;align-self:start;padding:0}
.stamp{right:104px;top:84px;font-size:46px}`,
  // B: the week as a ruler; each find an exhibit tag hung at its hour, its pin the only red on the ruler.
  C: `.title{top:84px}
.count{position:absolute;left:72px;top:330px;display:flex;align-items:center;gap:22px}.count .num{font-size:120px}
.count .w{font-weight:800;font-size:34px;line-height:1.2}
.stamp{left:80px;bottom:88px;font-size:52px}
.win{position:absolute;left:660px;right:0;top:64px;bottom:0;background:#12151a;border:1px solid rgba(255,255,255,.1);
border-right:0;border-bottom:0;border-radius:12px 0 0 0;overflow:hidden}
.tabs{display:flex;height:60px;background:#0e1014;border-bottom:1px solid rgba(255,255,255,.08)}
.tabs span{display:flex;align-items:center;padding:0 22px;font-weight:800;font-size:22px;color:#6b7280;
border-right:1px solid rgba(255,255,255,.06);font-variant-numeric:tabular-nums}
.tabs span.now{background:#12151a;color:#f1ebe0}
.code{padding:22px 0 0}.ln{display:flex;align-items:center;height:var(--lh);padding:0 44px;font-weight:600;
font-size:var(--fs);color:#8a929e;white-space:nowrap}
.ln.c{color:#5f6875}.ln.in{padding-left:88px}.ln i{display:block;margin:0 5px;height:calc(var(--fs) * .78);background:#2b313b;border-radius:2px}
.ln q{color:#5f6875;quotes:none}.ln.hit{background:rgba(214,58,34,.14);box-shadow:inset 4px 0 0 var(--red);color:#f1ebe0}
.ln.hit b{font-weight:800}`,
  // D: an evidence board: each find a pinned card, the red string running through them in time order.
  E: `.title{font-size:96px;text-transform:none}
.count{position:absolute;right:72px;top:96px;display:flex;align-items:baseline;gap:16px}
.count .num{font-size:72px}.count .w{font-weight:800;font-size:34px}
.stamp{right:96px;top:206px;font-size:40px}
.win{position:absolute;left:72px;right:72px;top:232px;bottom:56px;background:#12151a;border:1px solid rgba(255,255,255,.1);
border-radius:10px;display:grid;grid-template-columns:var(--side) 1fr;grid-template-rows:64px 1fr;overflow:hidden}
.path{grid-column:1 / -1;display:flex;align-items:center;gap:48px;padding:0 28px;border-bottom:1px solid rgba(255,255,255,.08);
font-weight:600;font-size:24px;color:#8a929e}
.side{padding:24px 0;border-right:1px solid rgba(255,255,255,.08);display:flex;flex-direction:column;gap:6px}
.side span{display:flex;align-items:center;gap:14px;height:44px;padding-left:calc(28px + var(--d) * 30px);font-weight:600;
font-size:24px;color:#aab0b9;white-space:nowrap}
.side span::before{content:'';flex:none;width:24px;height:18px;border-radius:2px 4px 4px 4px;background:#5a6270;
clip-path:polygon(0 0,40% 0,50% 18%,100% 18%,100% 100%,0 100%)}
.side span.hid::before{width:16px;height:20px;border-radius:1px;background:#5a6270;clip-path:polygon(0 0,70% 0,100% 26%,100% 100%,0 100%)}
.pane{position:relative;display:grid;grid-template-columns:repeat(var(--cols),1fr);grid-template-rows:repeat(var(--rows),1fr);
padding:24px 28px}
.file{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;border-radius:10px;border:1px solid transparent}
.file.sel{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.14)}
.doc{width:var(--dw);height:var(--dh);background:#e7e1d5;padding:calc(var(--dw) * .14) calc(var(--dw) * .12);
clip-path:polygon(0 0,76% 0,100% 18%,100% 100%,0 100%);position:relative}
.doc::after{content:'';position:absolute;right:0;top:0;width:24%;height:18%;background:#b9b2a5}
.doc .bars i{background:#121316}.doc .bars em{color:#121316}
.file b{font-weight:800;font-size:var(--fs);color:#f1ebe0;font-variant-numeric:tabular-nums}
.file small{font-weight:600;font-size:20px;color:#8a929e}`
  // F: the week's log sheet on the desk, a magnifier over the newest find's build, the older finds listed beside it.
};

const leakTitle = (oneLine: boolean) => `<div class="title"><b>Утечка</b>${oneLine ? ' ' : '<br>'}недели</div>`;

function leakA(cases: LeakCase[], since: number, now: number, eggs: Slots): string {
  const [tab, file, who] = eggs;
  const rowH = (768 - 120 - 64 - 72) / cases.length;
  const num = cases.length === 1 ? 132 : Math.round(Math.min(96, Math.max(40, rowH * 0.6)));
  const bh = cases.length <= 2 ? 22 : cases.length <= 4 ? 18 : 14;
  const gap = Math.round(bh * 0.7);
  const rows = cases
    .map(
      (each, index) =>
        `<div class="row"><span class="num">${escapeHtml(each.build)}</span><span class="day">${each.day}</span><span class="bars">${barsHtml(filled(each.text, 44, barsIn(cases.length === 1 ? rowH - num - 72 : rowH - 24, bh, gap)), index === cases.length - 1 ? file : undefined)}</span></div>`
    )
    .join('');
  const last = cases[cases.length - 1];
  return `<style>:root{--num:${num}px;--numw:${Math.round(num * 2.7)}px;--bh:${bh}px;--gap:${gap}px}</style>
${leakTitle(false)}
<div class="count"><div class="line"><span class="num">${cases.length}</span><span class="w">${plural(cases.length, 'находка', 'находки', 'находок')}</span></div><span class="week muted">${dayMonth(since)} — ${dayMonth(now)}</span></div>
<div class="tabs"><div class="tab">Дело № ${escapeHtml(last?.build ?? '')}</div>${egged(tab, (egg) => `<div class="tab egg">${escapeHtml(eggFileName(egg))}</div>`)}</div>
<div class="folder${cases.length === 1 ? ' single' : ''}">${rows}<div class="foot">${egged(who, (egg) => `<span class="egg">${escapeHtml(eggFileName(egg))}</span>`)}</div></div><div class="stamp">Секретно</div>`;
}

function leakC(cases: LeakCase[], eggs: Slots): string {
  const n = cases.length;
  // A tab more fits beside up to six builds; past that the eggs move into the code.
  const [first, second, third] = eggs;
  const [tab, key, todo] = n <= 6 ? [first, second, third] : [undefined, first, second];
  // Each find a comment line and its blacked-out lines, all inside the window, with the eggs' lines counted in.
  const per = n === 1 ? 8 : n === 2 ? 4 : n <= 4 ? 2 : 1;
  const extra = (key === undefined ? 0 : 1) + (todo === undefined ? 0 : 1);
  const lh = Math.min(54, Math.floor((768 - 64 - 60 - 40) / (n * (1 + per) + extra)));
  const fs = Math.max(20, Math.min(28, Math.round(lh * 0.52)));
  const code = cases
    .map((each, index) => {
      const rows = filled(each.text, 40, per).map(({ share, lead }, line) => {
        const width = Math.round(90 + 150 * share);
        const value = Math.round(60 + 200 * (1 - share * 0.6));
        // The first line's key is left in the clear: a word of the find, the rest blacked out.
        const name = line === 0 && lead !== '' ? escapeHtml(lead) : `<i style="width:${width}px"></i>`;
        return `<div class="ln in"><q>"</q>${name}<q>"</q><span style="width:24px"></span><q>"</q><i style="width:${value}px"></i><q>"</q></div>`;
      });
      // The newest find's last line is the one «caught»: the owner's own «"hidden" "1"» idea, true of any find.
      if (index === n - 1) {
        rows[rows.length - 1] =
          `<div class="ln in hit"><b>"hidden"</b><span style="width:24px"></span><b>"1"</b></div>`;
      }
      // The oldest find leaks one more file in the clear, set like the keys beside it.
      if (index === 0 && key !== undefined) {
        rows.push(
          `<div class="ln in"><q>"</q>${escapeHtml(eggFileName(key))}<q>"</q><span style="width:24px"></span><q>"</q>1<q>"</q></div>`
        );
      }
      return `<div class="ln c">// сборка ${escapeHtml(each.build)}, ${each.day}</div>${rows.join('')}`;
    })
    .join('');
  const tabs = cases
    .map((each, index) => `<span class="${index === n - 1 ? 'now' : ''}">${escapeHtml(each.build)}</span>`)
    .join('');
  return `<style>:root{--lh:${lh}px;--fs:${fs}px}</style>
${leakTitle(false)}
<div class="count"><span class="num">${n}</span><span class="w">${plural(n, 'находка', 'находки', 'находок')}<br>за неделю</span></div>
<div class="win"><div class="tabs">${tabs}${egged(tab, (egg) => `<span>${escapeHtml(eggFileName(egg))}</span>`)}</div><div class="code">${egged(todo, (egg) => `<div class="ln c">// TODO: ${escapeHtml(eggFileName(egg))}</div>`)}${code}</div></div><div class="stamp">Секретно</div>`;
}

// Look E's tree: wide enough for an egg's file name at a readable size.
const SIDE_W = 400;

function leakE(cases: LeakCase[], eggs: Slots): string {
  const [folder, hidden, owner] = eggs;
  const n = cases.length;
  const cols = n <= 4 ? n : Math.ceil(n / 2);
  const rows = n <= 4 ? 1 : 2;
  const pane = { width: 1392 - SIDE_W - 56, height: 768 - 232 - 56 - 64 - 48 };
  const cellW = pane.width / cols;
  const cellH = pane.height / rows;
  const fs = rows === 1 ? 26 : 22;
  const dh = Math.round(Math.min(cellH - fs - 20 - 14 - 40, (cellW - 40) / 0.78));
  const dw = Math.round(dh * 0.78);
  const bh = dw >= 160 ? 10 : 7;
  const gap = Math.round(bh * 0.8);
  const files = cases
    .map(
      (each, index) =>
        `<div class="file${index === n - 1 ? ' sel' : ''}"><div class="doc"><span class="bars">${barsHtml(redaction(each.text, 18, barsIn(dh * 0.72, bh, gap)))}</span></div><b>сборка ${escapeHtml(each.build)}</b><small>${each.day}</small></div>`
    )
    .join('');
  // The eggs as a folder and a file in the tree, and a file the path bar ends in, each set like its neighbours: the docs'
  // text is too small to read a joke in (owner, 26.10.2026: «плохо читается»).
  const treeItem = (name: string, depth: number, file: boolean) =>
    `<span${file ? ' class="hid"' : ''} style="--d:${depth};font-size:${Math.min(24, Math.floor((SIDE_W - 28 - depth * 30 - 38 - 12) / (name.length * 0.5)))}px">${escapeHtml(name)}</span>`;
  return `<style>:root{--cols:${cols};--rows:${rows};--dw:${dw}px;--dh:${dh}px;--fs:${fs}px;--bh:${bh}px;--gap:${gap}px;--side:${SIDE_W}px}</style>
${leakTitle(true)}<div class="count"><span class="num">${n}</span><span class="w">${plural(n, 'находка', 'находки', 'находок')}</span></div>
<div class="win"><div class="path">game/dota/pak01_dir${egged(owner, (egg) => `/${escapeHtml(eggFileName(egg))}`)}</div>
<div class="side"><span style="--d:0">scripts</span><span style="--d:1">npc</span>${egged(hidden, (egg) => treeItem(eggFileName(egg), 1, true))}<span style="--d:0">resource</span><span style="--d:1">localization</span>${egged(folder, (egg) => treeItem(eggFile(egg), 1, false))}<span style="--d:0">patchnotes</span></div>
<div class="pane">${files}</div></div><div class="stamp">Секретно</div>`;
}

function leakPicture(look: LeakLook, cases: LeakCase[], since: number, now: number, eggs: Slots): string {
  const body = {
    A: () => leakA(cases, since, now, eggs),
    C: () => leakC(cases, eggs),
    E: () => leakE(cases, eggs)
  }[look]();
  return picturePage(body, `${LEAK_BASE}\n${LEAK_CSS[look]}`);
}

// «Утечка недели» (owner, 26.10.2026): the week's finds in the game's files go to the writer as they are; it picks the
// one detail worth telling (modules/rubrics/briefs.ts). No finds, no rubric.
export async function filesDontLie(context: RubricContext): Promise<RubricSample> {
  // Two eggs in two of the look's three places, picked at random (owner, 26.10.2026: «в каждом две… в разных местах»).
  const [one, two] = shuffled([...LEAK_EGGS], context.random);
  const eggs: Slots = shuffled([one, two, undefined], context.random);
  const since = context.now - WEEK_MS;
  const found = await context.sources.gameFinds(since);
  if (found.length === 0) throw noData('game files finds');
  const blocks = found.map((find) => {
    const date = new Date(find.committedAt).toISOString().slice(0, 10).split('-').reverse().join('.');
    return [
      `Сборка ${find.build}, ${date}`,
      ...(find.note === null ? [] : [`Что нашла проверка: ${find.note}`]),
      ...(find.text === null ? [] : [`Пост об этой находке:\n${find.text}`])
    ].join('\n');
  });
  // The picture reads the week left to right, oldest find first.
  const cases = [...found]
    .sort((a, b) => a.committedAt - b.committedAt)
    .slice(-8)
    .map((find) => ({
      build: find.build,
      at: find.committedAt,
      day: dayMonth(find.committedAt),
      text: find.text ?? find.note ?? ''
    }));
  // The file explorer looks empty with one or two documents (owner, 26.10.2026: «скудно»): the case folder or the code
  // window take those weeks.
  const look = pick<LeakLook>(cases.length <= 2 ? ['A', 'C'] : [...LEAK_LOOKS], context.random);
  return {
    picture: { html: leakPicture(look, cases, since, context.now, eggs), ...PICTURE_SIZE },
    text: `Находки в файлах игры за неделю:\n\n${blocks.join('\n\n')}`,
    poll: null
  };
}

// «Оцениваем» rates a novelty, so it goes out only when a fresh announcement brings one (owner, 27.10.2026): of Valve's
// last twelve, two did (a treasure, an event with sets); patches, The International and tickets have nothing to rate.
const NOVELTY =
  /trove|treasure|сокровищ|arcana|аркан|persona|персон|collector|cache|set\b|сет|courier|курьер|new hero|новый герой|carnival|event/iu;
const NOT_NOVELTY = /patch|патч|update|обновлени|international|ticket|билет|qualifier|квалификац/iu;
const NOVELTY_FRESH_MS = 21 * 86_400_000;
const RATE_JOKES = [
  'Опять за 3 тысячи?',
  'Мама, купи',
  'Valve, где патч?',
  'Куплю и всё равно солью, но красиво',
  'Продам почку, вторая на Аркану',
  'Лучше бы баланс починили, пидорасы',
  'Скин есть, рук нет',
  'Деньги на ветер, ветер на Габена',
  'Куплю, когда выйду из Рекрута. То есть хуй вам',
  'Беру, пусть враги видят, на что я проебал зарплату',
  'Дорого, но жена не узнает. Жены нет',
  'Это хуйня, но я возьму, я слабый',
  'Valve, вы охуели?',
  'За такие деньги пусть ещё и тащит за меня',
  'Возьму в кредит, отдам смертью'
] as const;

export async function rateIt(context: RubricContext): Promise<RubricSample> {
  const latest = (await context.sources.steamNews()).find(
    (item) =>
      item.imageUrl !== null &&
      context.now - item.publishedAt <= NOVELTY_FRESH_MS &&
      NOVELTY.test(item.title) &&
      !NOT_NOVELTY.test(item.title)
  );
  if (latest === undefined || latest.imageUrl === null) throw noData('fresh novelty announcement');
  return {
    // The set's own picture and nothing else (owner, 27.10.2026: «просто картинку на сам сет и всё»), sent as Valve's
    // file: drawn into our 1536 px page it was stretched and soft; a narrow one is made sharper by the picture law.
    picture: null,
    photo: { url: latest.imageUrl },
    // The writer retells what the novelty is in Russian, names stay English (27.10.2026: the first sample said «Valve
    // показали новинку» and never named it).
    text: `Новинка от Valve: «${latest.title}».`,
    // The announcement is background, not a draft: its prices and dates need not all reach the post.
    reference: latest.text,
    poll: poll('Оцениваем', withJoke(['10/10, беру', 'Норм, но денег не дам', 'Говно'], context.random, RATE_JOKES))
  };
}

export async function workshopSet(context: RubricContext): Promise<RubricSample> {
  // A set never repeats in the channel (owner, 27.10.2026: «чтобы сет не повторялся»): the scheduler will skip the ids
  // already posted (docs/RUBRICS_SCHEDULER.md); the DEV sample takes one of the week's top ten at random.
  const ids = await context.sources.workshopTrendingIds();
  const id = pick(ids, context.random);
  const set = id === undefined ? null : await context.sources.workshopItem(id);
  // The hero comes from the Workshop's own tags (owner, 27.10.2026: «героя точно надо писать, мастерская это отдаёт»).
  const heroes = set === null ? [] : await context.sources.heroes();
  const hero = heroes.find((each) => set?.tags.some((tag) => tag.toLowerCase() === each.localizedName.toLowerCase()));
  if (set === null) throw noData('workshop');
  // The set's own photos from the Workshop, no picture of ours (owner, 27.10.2026: «фотографии из мастерской забирай и
  // их скидывай»); the page hides behind words, the verdict is the channel's reactions.
  return {
    picture: null,
    album: {
      // The author's own shots, uncropped; Steam's square cover only when there are none (owner, 27.10.2026: «главную
      // не надо, лучше забирать те, которые внутри, в их карусели, там не обрезанная»).
      photos: (set.screenshots.length > 0 ? set.screenshots : [set.previewUrl]).slice(
        0,
        WORKSHOP_ALBUM_MAX - set.clips.length
      ),
      clips: set.clips,
      cover: set.previewUrl
    },
    text:
      hero === undefined
        ? `Сет из мастерской Steam, который набирает популярность: «${set.title}».`
        : `Сет из мастерской Steam на ${hero.localizedName}, который набирает популярность: «${set.title}».`,
    links: [{ text: 'Посмотреть в мастерской', url: set.url }],
    footer: workshopVerdict(set.title, context.random),
    poll: null
  };
}

/** Telegram's album holds ten. */
const WORKSHOP_ALBUM_MAX = 10;
/**
 * The verdict by the channel's reactions, one of these at random (owner, 27.10.2026: «🔥 — имба, 💩 — пиздец и третий
 * типа обкончай меня, Педро… тут надо шутки придумать»). Only Telegram's standard reaction emoji.
 */
const WORKSHOP_VERDICTS = [
  '🔥 — имба, 💩 — пиздец, 😍 — обкончай меня, Педро',
  '🔥 — беру, 💩 — верните деньги, 🤡 — мой мейн заслужил лучшего',
  '🔥 — шедевр, 💩 — рисовали ногой, 😭 — мама, купи',
  '🔥 — в игру, 💩 — в помойку, 🗿 — закину 3к и пожалею',
  '🔥 — кончил, 💩 — блеванул, 🤯 — я это развидеть не могу',
  '🔥 — надеваю, 💩 — снимите это нахуй, 🤮 — меня тошнит',
  '🔥 — красиво, 💩 — хуйня, 🥴 — я бухой, мне норм',
  '🔥 — Valve, в игру, 💩 — Valve, в помойку, 🖕 — Valve, иди нахуй',
  '🔥 — хочу, 💩 — не хочу, 💔 — денег нет, есть долги',
  '🔥 — сочно, 💩 — уныло, 🍌 — мой герой заслужил банан',
  '🔥 — топ, 💩 — днище, 🤩 — влюбился, женюсь на сете',
  '🔥 — заебись, 💩 — пиздец, 🤣 — это сет или шутка?',
  '🔥 — беру сразу, 💩 — даже бесплатно нахуй, 😈 — надену врагу назло',
  '🔥 — шик, 💩 — позор, 💋 — расцеловал бы автора в жопу',
  '🔥 — да, 💩 — нет, 🌚 — я ничего не видел, мне 14'
] as const;
/**
 * A hero's own verdict, only for that hero's set (owner, 27.10.2026: «это для Пуджа-мейнера — только когда Пудж»): the
 * Workshop title starts with the hero, «Pudge | …».
 */
const HERO_VERDICTS: { hero: RegExp; verdict: string }[] = [
  { hero: /^pudge/iu, verdict: '🔥 — беру, 💩 — верните деньги, 🤡 — это для Пуджа-мейнера' }
];
const workshopVerdict = (title: string, random: () => number) => {
  const own = HERO_VERDICTS.find((each) => each.hero.test(title.trim()));
  return own !== undefined && random() < 0.5 ? own.verdict : pick(WORKSHOP_VERDICTS, random);
};
