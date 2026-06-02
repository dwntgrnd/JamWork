import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

// Reuse the app's Vite config (React plugin + `@` alias) and layer on the test env.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts',
      css: false,
    },
  }),
)
