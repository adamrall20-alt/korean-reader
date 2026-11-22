import { copyFileSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { build } from 'vite';

const desktopDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(desktopDir, '..');
const outDir = path.resolve(rootDir, '.output/desktop');

function verifyDesktopDependencies() {
  return {
    name: 'verify-desktop-dependencies',
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        for (const dependency of [...chunk.imports, ...chunk.dynamicImports]) {
          if (dependency !== 'electron' && !isBuiltin(dependency) && !Object.hasOwn(bundle, dependency)) {
            this.error(`Desktop bundle depends on an unpackaged module: ${dependency}`);
          }
        }
      }
    },
  };
}

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

  // 2. Build a self-contained Electron main process (CommonJS for Electron)
  await build({
    configFile: false,
    plugins: [verifyDesktopDependencies()],
    ssr: { noExternal: true },
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
        external: ['electron', 'node:crypto', 'node:fs', 'node:http', 'node:path', 'node:sqlite'],
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
    plugins: [verifyDesktopDependencies()],
    ssr: { noExternal: true },
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
copyFileSync(path.join(rootDir, 'assets', 'New logo update.png'), path.join(outDir, 'app-icon.png'));
