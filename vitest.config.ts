import { defineConfig, mergeConfig } from 'vitest/config'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { playwright } from '@vitest/browser-playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import viteConfig from './vite.config.ts'

const dirname = path.dirname(fileURLToPath(import.meta.url))

const sharedTestOptions = {
  clearMocks: true,
  restoreMocks: true,
  unstubEnvs: true,
  unstubGlobals: true,
  retry: 0,
}

export default defineConfig((environment) => mergeConfig(
  viteConfig(environment),
  defineConfig({
    test: {
      ...sharedTestOptions,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: [
          'src/**/*.d.ts',
          'src/types/**',
          'src/**/*.test.{ts,tsx}',
          'src/**/*.stories.{ts,tsx}',
          'src/**/generated/**',
          'src/**/config/**',
          'src/**/*Types.{ts,tsx}',
          'src/main.tsx',
        ],
      },
      projects: [
        {
          extends: true,
          test: {
            name: 'unit',
            environment: 'node',
            setupFiles: ['./tests/setup.ts'],
            include: [
              'src/**/*.test.{ts,tsx}',
              'tests/**/*.test.{ts,tsx}',
            ],
          },
        },
        {
          extends: true,
          plugins: [
            storybookTest({
              configDir: path.join(dirname, '.storybook'),
            }),
          ],
          test: {
            name: 'storybook',
            browser: {
              enabled: true,
              headless: true,
              provider: playwright({}),
              instances: [{
                browser: 'chromium',
              }],
            },
          },
        },
      ],
    },
  }),
))
