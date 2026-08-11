/// <reference types='vitest' />
import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import dts from 'vite-plugin-dts';
import { copyFileSync } from 'node:fs';
import * as path from 'path';

const outDir = '../../dist/packages/vue';

// Vite's library build (unlike the swc executor used by other packages) has no
// `assets` option, so copy the publish-relevant docs into the build output once
// the bundle is written. The publish-ready package.json is produced separately
// by tools/scripts/sync-publish-package-json.mjs in the `build` target.
function copyPublishAssets(): Plugin {
  const assets = ['LICENSE', 'README.md'];
  return {
    name: 'tactical-ddd:copy-publish-assets',
    apply: 'build',
    closeBundle() {
      for (const asset of assets) {
        copyFileSync(
          path.join(import.meta.dirname, asset),
          path.join(import.meta.dirname, outDir, asset),
        );
      }
    },
  };
}

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/vue',
  plugins: [
    vue(),
    dts({
      entryRoot: 'src',
      tsconfigPath: path.join(import.meta.dirname, 'tsconfig.lib.json'),
    }),
    copyPublishAssets(),
  ],
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [],
  // },
  // Configuration for building your library.
  // See: https://vite.dev/guide/build.html#library-mode
  build: {
    outDir,
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    lib: {
      // Could also be a dictionary or array of multiple entry points.
      entry: 'src/index.ts',
      name: '@tactical-ddd/vue',
      fileName: 'index',
      // Change this to the formats you want to support.
      // Don't forget to update your package.json as well.
      formats: ['es' as const],
    },
    rolldownOptions: {
      // External packages that should not be bundled into your library.
      external: ['vue', '@tactical-ddd/core'],
    },
  },
  test: {
    name: '@tactical-ddd/vue',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      // Matches the layout the other packages publish to Codecov from CI.
      reportsDirectory: './test-output/vitest/coverage',
      reporter: ['text-summary', 'lcov'],
      provider: 'v8' as const,
      include: ['src/**'],
    },
  },
}));
