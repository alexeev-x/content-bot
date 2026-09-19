import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

test('реальная конфигурация запрещает обходы границ, включая новые модули', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const modules = join(root, 'src', 'modules');
  mkdirSync(modules, { recursive: true });
  const dirs = [mkdtempSync(join(modules, 'boundary-a-')), mkdtempSync(join(modules, 'boundary-b-'))];
  try {
    for (const dir of dirs) writeFileSync(join(dir, 'service.ts'), 'export const value = 1;\n');
    const eslint = new ESLint({ cwd: root });
    const check = async (filePath, source, forbidden) => {
      const [result] = await eslint.lintText(source, { filePath });
      assert.equal(
        result.messages.some((message) => message.ruleId === 'import-x/no-restricted-paths'),
        forbidden,
        `${filePath}: ${source}`,
      );
    };
    const moduleA = dirs[0];
    const moduleB = dirs[1].split(sep).at(-1);
    await check(join(moduleA, 'service.ts'), "import 'src/app/config';", true);
    await check(join(moduleA, 'service.ts'), `export * from '../${moduleB}/service';`, true);
    await check(join(root, 'src/app/config.ts'), `import 'src/modules/${moduleB}/service';`, true);
    await check(join(root, 'src/lib/probe.ts'), "import '../core/telegram';", true);
    await check(join(root, 'src/schemas/probe.ts'), "import '../lib/errors';", true);
    await check(join(moduleA, 'service.ts'), "import '../../index';", true);
    await check(join(moduleA, 'service.ts'), "import 'src/core/telegram';", false);
    await check(join(root, 'src/index.ts'), `import 'src/modules/${moduleB}/service';`, false);
  } finally {
    for (const dir of dirs) {
      const target = resolve(dir);
      assert.ok(target.startsWith(resolve(modules) + sep));
      rmSync(target, { recursive: true });
    }
  }
});
