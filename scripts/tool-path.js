import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Запускаем JS-вход пакета через Node: без shell, .cmd и проблем с пробелами в пути. */
export const toolPath = (name, binary = name) => {
  const root = fileURLToPath(new URL(`../node_modules/${name}/package.json`, import.meta.url));
  const pkg = JSON.parse(readFileSync(root, 'utf8'));
  const entry = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin[binary];
  if (!entry) throw new Error(`Не найден исполняемый файл ${name}/${binary}`);
  return resolve(dirname(root), entry);
};
