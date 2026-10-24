import { test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mockApi } from './support/mock-api';

// `npm run layout:check [-- PAGES=/,/posts WIDTHS=375]` (env): every API answer is held back, the page is measured
// while it shows skeletons and again once its data is in, and every landmark that moved or resized is listed in
// .logs/layout-shifts.txt. Chromium's layout-shift entries are added, but they miss jumps outside the viewport and
// those right after load, so the geometry diff is the main signal. Mock data, not DEV: data-dependent sizes differ.
const PAGES = (
  process.env.PAGES ??
  '/,/posts,/posts/new,/posts/11111111-1111-4111-8111-111111111111,/posts/11111111-1111-4111-8111-111111111111/publish,/publications,/media,/sources,/sources?tab=heroes,/analytics,/analytics?tab=items,/analytics?tab=audience,/settings/channels,/settings/analytics,/settings/appearance,/settings/general,/settings/ai'
).split(',');
const WIDTHS = (process.env.WIDTHS ?? '375,1280,1920').split(',').map(Number);
// Session restore and then the page's own queries each wait this long: the route skeleton, then the page skeleton.
const API_DELAY_MS = 1500;
const PHASES_MS = [700, 2200, 3700];
const SETTLED_MS = 9000;
const TOLERANCE_PX = 2;
const LANDMARKS =
  'h1,h2,h3,[data-widget],[role=tab],[role=tablist],label,legend,button,input,[role=combobox],main header,[class*=legend] li,[class*=footer]';

type Box = { y: number; h: number; x: number; w: number };

/** Landmarks keyed by tag, role, label and occurrence, so the same element is found in both phases. */
function snapshot(page: Page): Promise<Record<string, Box>> {
  return page.evaluate((selector) => {
    const seen = new Map<string, number>();
    const result: Record<string, { y: number; h: number; x: number; w: number }> = {};
    for (const element of document.querySelectorAll(selector)) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const label =
        element.getAttribute('data-widget') ??
        element.getAttribute('aria-label') ??
        (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 28);
      const role = element.getAttribute('role');
      const base = `${element.tagName.toLowerCase()}${role ? `[${role}]` : ''} "${label}"`;
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      result[count > 1 ? `${base}#${count}` : base] = {
        y: Math.round(rect.top + scrollY),
        h: Math.round(rect.height),
        x: Math.round(rect.left),
        w: Math.round(rect.width)
      };
    }
    return result;
  }, LANDMARKS);
}

function diff(before: Box, after: Box): string {
  return (['y', 'h', 'x', 'w'] as const)
    .filter((key) => Math.abs(after[key] - before[key]) > TOLERANCE_PX)
    .map((key) => `d${key}${after[key] - before[key]}`)
    .join(' ');
}

test.setTimeout(30 * 60_000);
test('layout stays put from skeleton to data', async ({ page }) => {
  await mockApi(page);
  await page.route(/\/api\//, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, API_DELAY_MS));
    await route.fallback();
  });
  await page.addInitScript(() => {
    const store = window as unknown as { __shifts: string[] };
    store.__shifts = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as Array<{
        value: number;
        sources: Array<{ node: Node | null; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }>;
      }>) {
        const nodes = entry.sources.map((source) => {
          const text = (source.node?.textContent ?? '').trim().slice(0, 24);
          return `"${text}" y${Math.round(source.previousRect.y)}→${Math.round(source.currentRect.y)}`;
        });
        store.__shifts.push(`${entry.value.toFixed(4)} ${nodes.join(' | ')}`);
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });

  const report: string[] = [];
  for (const path of PAGES) {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 1400 });
      const start = Date.now();
      await page.goto(path);
      const phases: Array<[number, Record<string, Box>]> = [];
      for (const at of PHASES_MS) {
        await page.waitForTimeout(Math.max(0, at - (Date.now() - start)));
        phases.push([at, await snapshot(page)]);
      }
      await page.waitForTimeout(Math.max(0, SETTLED_MS - (Date.now() - start)));
      const settled = await snapshot(page);
      const moved = new Map<string, string>();
      for (const [at, snap] of phases) {
        for (const [key, box] of Object.entries(snap)) {
          const after = settled[key];
          const change = after ? diff(box, after) : '';
          if (change && !moved.has(key)) moved.set(key, `t${at} ${key}: ${change}`);
        }
      }
      const shifts = await page.evaluate(() => (window as unknown as { __shifts: string[] }).__shifts);
      report.push(`## ${path} @${width}: ${moved.size} moved`, ...[...moved.values()].map((line) => `  ${line}`));
      report.push(...shifts.map((line) => `  layout-shift ${line}`));
    }
  }
  mkdirSync('../../.logs', { recursive: true });
  writeFileSync('../../.logs/layout-shifts.txt', report.join('\n'));
});
