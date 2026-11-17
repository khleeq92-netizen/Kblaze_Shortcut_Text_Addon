// Production build for K-Flow Automation.
//   node scripts/build.mjs [--target=chrome|firefox] [--watch]
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest } from './manifest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const target = (args.find((a) => a.startsWith('--target=')) || '--target=chrome').split('=')[1];
const watch = args.includes('--watch');
const outDir = path.join(root, target === 'firefox' ? 'dist-firefox' : 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function loadEnv() {
  const env = {};
  for (const f of ['.env', '.env.local']) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}
const env = loadEnv();
const alias = { '@': path.join(root, 'src') };
const define = { __KF_TARGET__: JSON.stringify(target), __KF_VERSION__: JSON.stringify(pkg.version) };
const common = {
  configFile: false,
  envDir: root,
  resolve: { alias },
  define,
  logLevel: 'warn',
};

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// 1. Extension pages (dashboard, popup, overlay) - React, code-split, ES modules.
await build({
  ...common,
  root: path.join(root, 'src/pages'),
  base: '/',
  plugins: [react()],
  build: {
    outDir,
    emptyOutDir: false,
    target: 'es2021',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        dashboard: path.join(root, 'src/pages/dashboard/index.html'),
        popup: path.join(root, 'src/pages/popup/index.html'),
        overlay: path.join(root, 'src/pages/overlay/index.html'),
        sidepanel: path.join(root, 'src/pages/sidepanel/index.html'),
      },
      output: { chunkFileNames: 'chunks/[name]-[hash].js', assetFileNames: 'assets/[name]-[hash][extname]' },
    },
    watch: watch ? {} : null,
  },
});

// 2. Content script - single classic IIFE file (content scripts cannot be ES modules).
// 3. Background - single ES module file (service worker / Firefox event page).
for (const [name, entry, format] of [
  ['content', 'src/content/index.ts', 'iife'],
  // injected into the page MAIN world only when the user runs a script (sval interpreter, no eval)
  ['script-host', 'src/script-host/index.ts', 'iife'],
  // sandboxed page used by the dashboard for script dry runs (no extension privileges)
  ['sandbox', 'src/sandbox/index.ts', 'iife'],
  ['background', 'src/background/index.ts', 'es'],
]) {
  await build({
    ...common,
    build: {
      outDir,
      emptyOutDir: false,
      target: 'es2021',
      sourcemap: false,
      minify: true,
      lib: { entry: path.join(root, entry), formats: [format], name: 'KFlow_' + name.replace(/-/g, '_'), fileName: () => name + '.js' },
      rollupOptions: { output: { inlineDynamicImports: true } },
      watch: watch ? {} : null,
    },
  });
}

// 4. Static files + manifest.
fs.cpSync(path.join(root, 'public'), outDir, { recursive: true });
const manifest = buildManifest({ target, version: pkg.version, key: env.KF_EXTENSION_KEY || undefined });
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`K-Flow Automation built for ${target} -> ${path.relative(root, outDir)}`);
