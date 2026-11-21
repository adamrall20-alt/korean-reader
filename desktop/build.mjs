import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { build } from 'vite';

const desktopDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(desktopDir, '..');
const outDir = path.resolve(rootDir, '.output/desktop');

async function buildDesktop() {
  // 1. Build Vue 3 + Tailwind renderer
  await build({
    configFile: false,
    root: path.resolve(desktopDir, 'src/renderer'),
    base: './',
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        '@': rootDir,
      },
    },
    build: {
      outDir: path.resolve(outDir, 'renderer'),
      emptyOutDir: true,
    },
  });

  // 2. Build Electron main process (CommonJS for Electron)
  await build({
    configFile: false,
    resolve: {
      alias: {
        '@': rootDir,
      },
    },
    build: {
      outDir: path.resolve(outDir, 'main'),
      emptyOutDir: true,
      ssr: path.resolve(desktopDir, 'src/main/index.ts'),
      target: 'node22',
      rollupOptions: {
        external: ['electron', 'node:path', 'node:sqlite'],
        output: {
          format: 'cjs',
          entryFileNames: 'index.cjs',
        },
      },
    },
  });

  // 3. Build Electron preload script (CommonJS for sandboxed preload)
  await build({
    configFile: false,
    resolve: {
      alias: {
        '@': rootDir,
      },
    },
    build: {
      outDir: path.resolve(outDir, 'main'),
      emptyOutDir: false,
      ssr: path.resolve(desktopDir, 'src/main/preload.ts'),
      target: 'node22',
      rollupOptions: {
        external: ['electron'],
        output: {
          format: 'cjs',
          entryFileNames: 'preload.cjs',
        },
      },
    },
  });
}

await buildDesktop();
