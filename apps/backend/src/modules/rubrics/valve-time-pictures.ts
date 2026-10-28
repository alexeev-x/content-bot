// «Валв-тайм» (08): it goes out only on round milestones with no patch (30, 45, 60, 90 days). The factory sign
// «N дней без травм» becomes «N дней без патча». The owner chose two looks of three to take turns (27.10.2026):
// A a flip-digit counter board, C a loading bar that never ends.
import { escapeHtml, picturePage } from './picture';

export const VALVE_TIME_LOOKS = ['A', 'C'] as const;
export type ValveTimeLook = (typeof VALVE_TIME_LOOKS)[number];

export interface ValveTimeFacts {
  /** Whole days since the last patch came out. */
  days: number;
  /** The last patch, e.g. `7.41f`. */
  version: string;
  /** When it came out, already in Russian, e.g. `15 сентября`. */
  date: string;
}

/** «день / дня / дней» after a number. */
export function daysWord(days: number) {
  const tens = days % 100;
  const ones = days % 10;
  if (tens >= 11 && tens <= 14) return 'дней';
  if (ones === 1) return 'день';
  return ones >= 2 && ones <= 4 ? 'дня' : 'дней';
}

const MILESTONES = [30, 45, 60, 90];

/**
 * One line under the facts, by the mark reached (owner, 27.10.2026: «шутка может быть, но эта плохая» about «Гейб считает
 * до трёх»; the owner wrote the 30-day line). Calm, no explaining.
 */
function joke(days: number) {
  if (days < 45) return 'Месяц без патча. Но нам не привыкать';
  if (days < 60) return 'Полтора месяца без патча. Держимся';
  if (days < 90) return 'Два месяца без патча. Уже даже не обидно';
  return 'Три месяца без патча. Valve, мы всё ещё тут';
}

const BASE = `body{display:block;padding:0;background:#0c0d0f}body::before,body::after{content:none}
.main{position:absolute;inset:0;display:block;padding:0}.main::after{content:none}
.mark{top:40px;left:72px;color:#6b6f76;z-index:3}
.title{position:absolute;left:68px;top:72px;margin:0;font-family:Tektur,sans-serif;font-size:88px;line-height:1;
letter-spacing:-.01em;text-transform:none;white-space:nowrap}.title::after{content:none}
.big{font-family:Tektur,sans-serif;font-weight:800;line-height:1;font-variant-numeric:tabular-nums;color:#f1ebe0}
.lab{font-weight:600;font-size:20px;line-height:1.2;color:#8a929e}
.val{font-weight:800;font-size:48px;line-height:1;font-variant-numeric:tabular-nums;color:#f1ebe0;white-space:nowrap}
.joke{font-weight:600;font-size:28px;line-height:1.2;color:#8a929e;white-space:nowrap}`;

const fact = (label: string, value: string) =>
  `<div class="fact"><div class="lab">${label}</div><div class="val">${escapeHtml(value)}</div></div>`;

const LOOKS: Record<ValveTimeLook, { body(facts: ValveTimeFacts): string; css: string }> = {
  // A: the safety board. Each digit on its own flip card, the words and the facts beside them like the sign's plate.
  A: {
    body: ({ days, version, date }) => {
      const digits = String(days).split('');
      const width = Math.floor((736 - 16 * (digits.length - 1)) / digits.length);
      const size = Math.min(440, Math.floor(width / 0.66));
      const tiles = digits.map((digit) => `<div class="tile big">${digit}</div>`).join('');
      return `<style>:root{--w:${width}px;--f:${size}px}</style><div class="tiles">${tiles}</div>
<div class="side"><div class="head">${daysWord(days)} без<br><b>патча</b></div>
<div class="facts">${fact('Последний патч', version)}${fact('Вышел', date)}</div>
<div class="joke">${escapeHtml(joke(days))}</div></div>`;
    },
    css: `.tiles{position:absolute;left:72px;top:112px;height:584px;display:flex;gap:16px}
.tile{position:relative;width:var(--w);height:100%;display:flex;align-items:center;justify-content:center;font-size:var(--f);
border-radius:10px;background:#16191d;border:1px solid rgba(255,255,255,.1)}
.tile::after{content:'';position:absolute;left:0;right:0;top:50%;height:6px;margin-top:-3px;background:#0c0d0f}
.side{position:absolute;left:872px;right:72px;top:112px;bottom:72px;display:flex;flex-direction:column}
.head{font-family:Tektur,sans-serif;font-weight:800;font-size:104px;line-height:1;letter-spacing:-.01em;white-space:nowrap}
.head b{color:var(--red)}
.facts{margin-top:64px;display:flex;flex-direction:column;gap:24px}.fact .lab{margin-bottom:8px}
.joke{margin-top:auto}`
  },
  // C: the patch «loading»: one segment per day up to 90, filled as far as the wait has come, the milestones under it.
  C: {
    body: ({ days, version, date }) => {
      const span = Math.max(90, days);
      const segments = Array.from({ length: span }, (_, day) => `<i${day < days ? ' class="on"' : ''}></i>`).join('');
      const ticks = MILESTONES.filter((day) => day <= span)
        .map((day) => {
          const state = day <= days ? ' on' : '';
          const end = day === span ? ' end' : '';
          return `<span class="t${state}${end}" style="left:${((day / span) * 100).toFixed(2)}%">${day}</span>`;
        })
        .join('');
      return `<div class="title">Патч <b>грузится</b></div>
<div class="count"><span class="big n">${days}</span><span class="u">${daysWord(days)}</span></div>
<div class="facts">${fact('Последний патч', version)}${fact('Вышел', date)}</div>
<div class="joke">${escapeHtml(joke(days))}</div>
<div class="bar">${segments}</div><div class="ticks">${ticks}</div>`;
    },
    css: `.joke{position:absolute;left:72px;top:184px}
.count{position:absolute;left:72px;top:262px;display:flex;align-items:baseline;gap:24px}
.count .n{font-size:220px;letter-spacing:-.02em}.count .u{font-weight:800;font-size:56px;color:#f1ebe0}
.facts{position:absolute;right:72px;top:330px;display:flex;gap:64px;text-align:right}.fact .lab{margin-bottom:8px}
.bar{position:absolute;left:72px;right:72px;top:540px;height:84px;padding:8px;display:flex;gap:3px;
border:1px solid rgba(255,255,255,.18);border-radius:10px}
.bar i{flex:1;border-radius:2px;background:#1a1e24}.bar i.on{background:#f1ebe0}
.ticks{position:absolute;left:81px;right:81px;top:640px;height:40px}
.t{position:absolute;top:0;transform:translateX(-50%);padding-top:14px;font-weight:800;font-size:24px;line-height:1;
color:#5e6570;font-variant-numeric:tabular-nums}
.t::before{content:'';position:absolute;left:50%;top:0;width:2px;height:8px;background:currentColor}
.t.end{transform:translateX(-100%)}.t.end::before{left:auto;right:0}.t.on{color:#f1ebe0}`
  }
};

/** Rubric 08's picture: how long the game has gone without a patch. Pure; the page goes through `picturePage`. */
export function valveTimePicture(look: ValveTimeLook, facts: ValveTimeFacts): string {
  const chosen = LOOKS[look];
  return picturePage(chosen.body(facts), BASE + chosen.css);
}
