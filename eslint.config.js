import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'out/**', 'node_modules/**'],
  },
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ['src/**/*.ts', 'tests/**/*.ts'],
  })),
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['src/engine/**/*.ts'],
    ignores: ['src/engine/apply.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../gm/*',
                '../gm/**',
                '../seats/*',
                '../seats/**',
                '../runtime/*',
                '../runtime/**',
                '../packs/*',
                '../packs/**',
                '../../packs/*',
                '../../packs/**',
                'node:*',
                'node:*/**',
              ],
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/engine/apply.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../runtime/*',
                '../runtime/**',
                'node:*',
                'node:*/**',
              ],
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/gm/**/*.ts', 'src/seats/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '../engine/apply.js' },
            { name: '../engine/index.js' },
          ],
          patterns: [
            {
              group: [
                '../engine/apply*',
                '../engine/index*',
                '../runtime/*',
                '../runtime/**',
                'node:*',
                'node:*/**',
              ],
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/gm/**/*.ts'],
    ignores: ['src/gm/flow.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '../engine/apply.js' },
            { name: '../engine/index.js' },
            { name: './flow.js' },
            { name: './flow' },
          ],
          patterns: [
            {
              group: [
                '../engine/apply*',
                '../engine/index*',
                '../runtime/*',
                '../runtime/**',
                './flow*',
                'node:*',
                'node:*/**',
              ],
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/engine/**/*.ts', 'src/gm/**/*.ts', 'src/seats/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Math.random is forbidden in engine, gm, and seats.',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'Date.now is forbidden in engine, gm, and seats.',
        },
      ],
    },
  },
);
