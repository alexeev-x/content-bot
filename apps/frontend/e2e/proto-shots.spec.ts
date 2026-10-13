import { mkdirSync } from 'node:fs';
import { test, type Page } from '@playwright/test';
import { SCREENS } from '../src/pages/prototypes/registry';

// Screenshots of the clickable prototype (/__proto) for owner approval. Local only: set PROTO_SHOTS to a folder.
const dir = process.env['PROTO_SHOTS'];
test.skip(!dir, 'PROTO_SHOTS is not set');

type Viewport = 'D' | 'M';
const SIZES: Record<Viewport, { width: number; height: number }> = {
  D: { width: 1440, height: 900 },
  M: { width: 375, height: 812 }
};
type Shot = {
  group: string;
  name: string;
  url: string;
  /** Which viewports; `both` themes for set A, dark only (plus light desktop) for set B. */
  viewports?: Viewport[];
  setA?: boolean;
  /** Actions before the shot: the shot is then taken of the viewport, because overlays are fixed. */
  run?: (page: Page, viewport: Viewport) => Promise<void>;
  overlay?: boolean;
  settle?: number;
};

const SET_A = new Set(['home', 'posts', 'publications', 'editor-new', 'editor-approved']);
const OVERLAY_QUERY = /id=/;

const shots: Shot[] = [];
for (const screen of SCREENS) {
  for (const state of screen.states) {
    const url = `/__proto${screen.path ? `/${screen.path}` : ''}${state.query ? `?${state.query}` : ''}`;
    shots.push({
      group: screen.id,
      name: state.id,
      url,
      setA: SET_A.has(screen.id),
      overlay: OVERLAY_QUERY.test(state.query) || state.id === 'keyboard',
      ...(state.id === 'keyboard' ? { viewports: ['M'] as Viewport[] } : {}),
      ...(state.id === 'loading' ? { settle: 100 } : {})
    });
  }
}

const click =
  (name: string | RegExp, role: 'button' | 'option' | 'radio' | 'menuitem' | 'tab' | 'link' = 'button') =>
  async (page: Page) => {
    await page.getByRole(role, { name }).first().click();
    await page.waitForTimeout(350);
  };

const extras: Shot[] = [
  {
    group: 'shell',
    name: 'sidebar-collapsed',
    url: '/__proto',
    viewports: ['D'],
    setA: true,
    run: async (page) => {
      await page.getByRole('button', { name: 'Свернуть меню' }).click();
      await page.waitForTimeout(500);
    }
  },
  {
    group: 'shell',
    name: 'status-popover-healthy',
    url: '/__proto',
    setA: true,
    overlay: true,
    run: click('Состояние системы')
  },
  {
    group: 'shell',
    name: 'status-popover-problem',
    url: '/__proto?state=problem',
    setA: true,
    overlay: true,
    run: click('Состояние системы')
  },
  {
    group: 'shell',
    name: 'more-sheet',
    url: '/__proto',
    viewports: ['M'],
    setA: true,
    overlay: true,
    run: click('Ещё')
  },
  {
    group: 'shell',
    name: 'search-palette',
    url: '/__proto',
    viewports: ['D'],
    overlay: true,
    run: async (page) => {
      await page.keyboard.press('Control+k');
      await page.waitForTimeout(400);
    }
  },
  {
    group: 'preview-nav',
    name: 'sidebar-expanded',
    url: '/__proto',
    viewports: ['D'],
    run: click('Превью')
  },
  {
    group: 'media',
    name: 'upload-progress',
    url: '/__proto/media',
    overlay: true,
    run: async (page) => {
      await page
        .getByRole('button', { name: /Загрузить/ })
        .first()
        .click();
      await page.getByRole('button', { name: 'Выбрать файлы' }).click();
      await page.waitForTimeout(1800);
    }
  },
  {
    group: 'media',
    name: 'insert-picker',
    url: '/__proto/media?id=m1',
    overlay: true,
    run: click('Вставить в пост')
  },
  {
    group: 'media',
    name: 'insert-toast',
    url: '/__proto/media?id=m1',
    overlay: true,
    run: async (page) => {
      await page.getByRole('button', { name: 'Вставить в пост' }).click();
      await page.getByRole('button', { name: 'Добавить в пост' }).click();
      await page.waitForTimeout(500);
    }
  },
  {
    group: 'media',
    name: 'filtered-empty',
    url: '/__proto/media',
    run: async (page) => {
      await page.getByRole('searchbox', { name: 'Поиск файлов' }).fill('кактус');
      await page.waitForTimeout(400);
    }
  },
  {
    group: 'automations',
    name: 'stop-confirm',
    url: '/__proto/automations',
    overlay: true,
    run: async (page) => {
      await page.getByRole('switch', { name: 'Задача «Очередь публикаций»' }).first().click({ force: true });
      await page.waitForTimeout(400);
    }
  },
  {
    group: 'automations',
    name: 'stopped-undo',
    url: '/__proto/automations',
    overlay: true,
    run: async (page) => {
      await page.getByRole('switch', { name: 'Задача «Очередь публикаций»' }).first().click({ force: true });
      await page.getByRole('button', { name: 'Остановить' }).click();
      await page.waitForTimeout(1200);
    }
  },
  {
    group: 'calendar',
    name: 'move-dialog',
    url: '/__proto/calendar?date=2026-10-08&id=c9',
    overlay: true,
    run: async (page) => {
      await page.getByRole('button', { name: 'Перенести' }).first().click();
      await page.waitForTimeout(400);
    }
  },
  {
    group: 'analytics',
    name: 'period-select',
    url: '/__proto/analytics',
    overlay: true,
    viewports: ['D'],
    run: async (page) => {
      await page.waitForTimeout(600);
      await page
        .getByRole('button', { name: /Период/ })
        .first()
        .click();
      await page.waitForTimeout(300);
    }
  },
  {
    group: 'analytics',
    name: 'period-sheet',
    url: '/__proto/analytics',
    overlay: true,
    viewports: ['M'],
    run: click(/^Фильтры/)
  },
  {
    group: 'marking',
    name: 'preview-toast',
    url: '/__proto/media?id=m1',
    overlay: true,
    run: async (page) => {
      await page.getByRole('button', { name: 'Скачать' }).click();
      await page.waitForTimeout(400);
    }
  },
  {
    group: 'posts',
    name: 'filtered-empty',
    url: '/__proto/posts',
    setA: true,
    run: async (page) => {
      await page.getByRole('searchbox', { name: 'Поиск по постам' }).fill('кактус');
      await page.waitForTimeout(400);
    }
  },
  {
    group: 'posts',
    name: 'selection',
    url: '/__proto/posts',
    setA: true,
    run: async (page, viewport) => {
      if (viewport === 'M') {
        await page.getByRole('button', { name: 'Действия со списком' }).click();
        await page.getByRole('menuitem', { name: 'Выбрать' }).click();
        await page.getByRole('checkbox').nth(0).check({ force: true });
        await page.getByRole('checkbox').nth(2).check({ force: true });
      } else {
        await page.getByRole('button', { name: 'Выбрать' }).click();
        await page.getByRole('checkbox').nth(1).check({ force: true });
        await page.getByRole('checkbox').nth(3).check({ force: true });
      }
      await page.waitForTimeout(300);
    }
  },
  {
    group: 'posts',
    name: 'filter-sheet-2',
    url: '/__proto/posts',
    viewports: ['M'],
    setA: true,
    overlay: true,
    run: async (page) => {
      await page.getByRole('button', { name: 'Фильтры' }).click();
      await page
        .getByRole('button', { name: /Статус/ })
        .last()
        .click();
      await page.getByRole('option', { name: 'Черновик' }).click();
      await page
        .getByRole('button', { name: /Сортировка/ })
        .last()
        .click();
      await page.getByRole('option', { name: 'По названию' }).click();
      await page.waitForTimeout(300);
    }
  },
  {
    group: 'posts',
    name: 'delete-confirm',
    url: '/__proto/posts',
    overlay: true,
    viewports: ['D'],
    run: async (page) => {
      await page.getByRole('button', { name: /Действия: Патч/ }).click();
      await page.getByRole('menuitem', { name: 'Удалить' }).click();
      await page.waitForTimeout(300);
    }
  },
  {
    group: 'publications',
    name: 'publish-dialog',
    url: '/__proto/publications',
    setA: true,
    overlay: true,
    run: click('Опубликовать пост')
  },
  {
    group: 'publications',
    name: 'publish-dialog-schedule',
    url: '/__proto/publications',
    setA: true,
    overlay: true,
    run: async (page) => {
      await page.getByRole('button', { name: 'Опубликовать пост' }).click();
      await page.getByRole('radio', { name: 'Запланировать' }).check({ force: true });
      await page.waitForTimeout(300);
    }
  },
  {
    group: 'reconcile',
    name: 'choice',
    url: '/__proto/publications?view=errors&id=u4',
    setA: true,
    overlay: true,
    run: async (page) => {
      await page.getByRole('button', { name: 'Проверить в Telegram и закрыть' }).click();
      await page.getByRole('radio', { name: /Сообщения нет, отправить снова/ }).check({ force: true });
      await page.waitForTimeout(300);
    }
  },
  {
    group: 'reconcile',
    name: 'confirm',
    url: '/__proto/publications?view=errors&id=u4',
    setA: true,
    overlay: true,
    run: async (page) => {
      await page.getByRole('button', { name: 'Проверить в Telegram и закрыть' }).click();
      await page.getByRole('radio', { name: /Сообщения нет, отправить снова/ }).check({ force: true });
      await page.getByRole('button', { name: 'Подтвердить' }).click();
      await page.waitForTimeout(400);
    }
  },
  {
    group: 'editor-new',
    name: 'typed',
    url: '/__proto/posts/new',
    setA: true,
    run: async (page) => {
      await page.getByRole('textbox', { name: 'Заголовок' }).fill('Итоги недели в про-сцене');
      await page
        .getByRole('textbox', { name: 'Текст поста' })
        .fill('Team Spirit проиграла в четвертьфинале.\n\nРазбираем драфт третьей карты.');
      await page.waitForTimeout(2200);
    }
  },
  {
    group: 'editor-new',
    name: 'preview-tab',
    url: '/__proto/posts/p3',
    viewports: ['M'],
    setA: true,
    run: async (page) => {
      await page.getByRole('radio', { name: 'Превью' }).check({ force: true });
      await page.waitForTimeout(300);
    }
  },
  {
    group: 'editor-new',
    name: 'save-failed-leave',
    url: '/__proto/posts/new?state=failed',
    overlay: true,
    run: async (page) => {
      await page.getByRole('textbox', { name: 'Текст поста' }).fill('Черновик, который не сохранился');
      await page.waitForTimeout(2200);
      await page.getByRole('button', { name: 'Посты' }).first().click();
      await page.waitForTimeout(300);
    }
  },
  {
    group: 'editor-approved',
    name: 'approve-dialog',
    url: '/__proto/posts/p3',
    overlay: true,
    run: async (page) => {
      await page
        .getByRole('textbox', { name: 'Текст поста' })
        .fill('Team Spirit проиграла в четвертьфинале. Разбираем драфт.');
      await page.waitForTimeout(2200);
      await page.getByRole('button', { name: 'Одобрить' }).last().click();
      await page.waitForTimeout(300);
    }
  },
  {
    group: 'editor-approved',
    name: 'publish-dialog',
    url: '/__proto/posts/p4',
    setA: true,
    overlay: true,
    run: click(/Опубликовать…/)
  },
  {
    group: 'channels',
    name: 'add-step1',
    url: '/__proto/settings/channels',
    overlay: true,
    run: click('Добавить канал')
  },
  {
    group: 'channels',
    name: 'add-step2-result',
    url: '/__proto/settings/channels',
    overlay: true,
    run: async (page) => {
      await page.getByRole('button', { name: 'Добавить канал' }).first().click();
      await page.getByRole('textbox', { name: 'Канал' }).fill('@alexeev_news');
      await page.getByRole('textbox', { name: 'Канал' }).press('Enter');
      await page.waitForTimeout(1500);
    }
  },
  {
    group: 'channels',
    name: 'add-step3-saved',
    url: '/__proto/settings/channels',
    run: async (page) => {
      await page.getByRole('button', { name: 'Добавить канал' }).first().click();
      await page.getByRole('textbox', { name: 'Канал' }).fill('@alexeev_news');
      await page.getByRole('textbox', { name: 'Канал' }).press('Enter');
      await page.waitForTimeout(1500);
      await page.getByRole('button', { name: 'Сохранить канал' }).click();
      await page.waitForTimeout(500);
    }
  },
  {
    group: 'channels',
    name: 'drawer',
    url: '/__proto/settings/channels',
    overlay: true,
    run: async (page) => {
      await page
        .getByRole('button', { name: /Official RU/ })
        .first()
        .click();
      await page.waitForTimeout(400);
    }
  },
  {
    group: 'appearance',
    name: 'dirty',
    url: '/__proto/settings/appearance',
    run: async (page) => {
      await page.getByRole('radio', { name: 'Индиго' }).first().check({ force: true });
      await page.waitForTimeout(500);
    }
  },
  {
    group: 'appearance',
    name: 'custom-colour-dialog',
    url: '/__proto/settings/appearance',
    overlay: true,
    run: click('Свой цвет')
  }
];

const all = [...shots, ...extras];

for (const shot of all) {
  for (const viewport of shot.viewports ?? (['D', 'M'] as Viewport[])) {
    for (const scheme of ['dark', 'light'] as const) {
      // Set B: dark on both viewports, light only on desktop (owner approves light from D).
      const lightAllowed = shot.setA || viewport === 'D';
      if (scheme === 'light' && !lightAllowed) continue;
      test(`${shot.group}/${shot.name} ${viewport} ${scheme}`, async ({ page }) => {
        test.setTimeout(60_000);
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
        await page.setViewportSize(SIZES[viewport]);
        await page.goto(shot.url);
        await page.waitForTimeout(shot.settle ?? 1500);
        if (shot.run) await shot.run(page, viewport);
        await page.evaluate(() => {
          document.documentElement.dataset['protoShot'] = '1';
        });
        const file = `${dir}/${shot.group}/${scheme}-${viewport}-${shot.name}.png`;
        mkdirSync(`${dir}/${shot.group}`, { recursive: true });
        if (shot.overlay) {
          await page.screenshot({ path: file });
        } else {
          // Full page: the viewport grows to the document so fixed bars sit at the real bottom.
          const height = await page.evaluate(() => document.documentElement.scrollHeight);
          await page.setViewportSize({
            width: SIZES[viewport].width,
            height: Math.max(height, SIZES[viewport].height)
          });
          await page.waitForTimeout(150);
          await page.screenshot({ path: file });
        }
        if (viewport === 'M') {
          const { scrollWidth, clientWidth } = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth
          }));
          if (scrollWidth > clientWidth) throw new Error(`horizontal scroll at 375: ${scrollWidth} > ${clientWidth}`);
        }
      });
    }
  }
}

// Обзор: every panel keeps its height from skeleton to data (UX_SPEC §2.6), measured at D and M.
const AREAS = ['attention', 'today', 'upcoming', 'recent', 'pulse', 'analytics', 'system'];
const measure = (page: Page) =>
  page.evaluate(
    (areas) =>
      Object.fromEntries(
        areas.map((area) => [
          area,
          Math.round(document.querySelector(`[data-area="${area}"]`)?.getBoundingClientRect().height ?? -1)
        ])
      ),
    AREAS
  );
for (const viewport of ['D', 'M'] as Viewport[]) {
  test(`home/panel-heights ${viewport}`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize(SIZES[viewport]);
    await page.goto('/__proto?state=loading');
    await page.waitForTimeout(600);
    const loading = await measure(page);
    await page.goto('/__proto');
    await page.waitForTimeout(1800);
    const loaded = await measure(page);
    await page.goto('/__proto?state=empty');
    await page.waitForTimeout(1800);
    const empty = await measure(page);
    console.log(`HEIGHTS ${viewport}`, JSON.stringify({ loading, loaded, empty }));
    for (const area of AREAS) {
      if (loading[area] !== loaded[area])
        console.log(`MISMATCH ${area}: loading ${loading[area]} != loaded ${loaded[area]}`);
      if (empty[area] !== loaded[area]) console.log(`MISMATCH ${area}: empty ${empty[area]} != loaded ${loaded[area]}`);
    }
  });
}

for (const width of [1000, 900, 1280]) {
  test(`home/width-${width}`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/__proto');
    await page.waitForTimeout(1500);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width, height });
    mkdirSync(`${dir}/home`, { recursive: true });
    await page.screenshot({ path: `${dir}/home/dark-${width}.png` });
  });
}
