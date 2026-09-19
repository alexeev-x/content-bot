import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import-x';
import tseslint from 'typescript-eslint';

/** Имена модулей читаем с диска: новый модуль получает свою зону автоматически. */
const moduleNames = (() => {
  try {
    return readdirSync(new URL('./src/modules', import.meta.url), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return [];
  }
})();

const LEVEL_ZERO = ['./src/types', './src/const', './src/schemas'];
const ABOVE_LIB = ['./src/core', './src/modules', './src/app', './src/index.ts'];
const ABOVE_CORE = ['./src/modules', './src/app', './src/index.ts'];

/**
 * Слои строгие: импорт только вниз и никогда вбок.
 *   index.ts -> modules/middleware -> core -> lib -> (types | schemas | const)
 */
const layerZones = [
  {
    target: LEVEL_ZERO,
    from: [...ABOVE_LIB, './src/lib'],
    message: 'Уровень 0 (types/schemas/const) не импортирует ничего: он самый нижний.',
  },
  {
    target: './src/lib',
    from: ABOVE_LIB,
    message: 'lib не знает о домене и фичах — и не реэкспортирует их. Опусти общее ниже или подними выше.',
  },
  {
    target: './src/core',
    from: ABOVE_CORE,
    message: 'core не знает о фичах. Нужна фича — значит, это не core.',
  },
  {
    target: './src/app',
    from: ['./src/modules', './src/index.ts'],
    message: 'app — вход в приложение, он не знает о фичах. Объяви порт и свяжи в src/index.ts.',
  },
  {
    target: './src/modules',
    from: ['./src/app', './src/index.ts'],
    message: 'Фича не зависит от входа: её можно поднять из очереди и cron, а не только из Telegram.',
  },
];

/** Фича не видит соседей: связывание — только в src/index.ts через порты. */
const siblingZones = moduleNames.map((name) => ({
  target: `./src/modules/${name}`,
  from: './src/modules',
  except: [`./${name}`],
  message: `Фича «${name}» не может импортировать соседа. Объяви порт в потребителе и свяжи в src/index.ts.`,
}));

export default tseslint.config(
  { ignores: ['node_modules', '.wrangler', 'migrations', 'worker-configuration.d.ts'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    plugins: { 'import-x': importPlugin },
    settings: {
      'import-x/resolver': { typescript: { project: './tsconfig.json' } },
    },
    rules: {
      'import-x/no-restricted-paths': [
        'error',
        { basePath: fileURLToPath(new URL('.', import.meta.url)), zones: [...layerZones, ...siblingZones] },
      ],
      'import-x/no-cycle': 'error',
      'import-x/no-duplicates': 'error',
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
          pathGroups: [{ pattern: 'src/**', group: 'internal', position: 'before' }],
          alphabetize: { order: 'asc', caseInsensitive: true },
          'newlines-between': 'never',
        },
      ],
      // Конвенции проекта: формы объектов — через type, импорты типов — явные.
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'separate-type-imports' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // Локальные скрипты: обычный Node, а не рантайм Workers.
    files: ['scripts/**/*.js', 'eslint.config.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        AbortSignal: 'readonly',
      },
    },
  },
  prettier,
);
