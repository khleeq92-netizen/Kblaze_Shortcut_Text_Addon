// Writes samples/*.json from the built-in sample data and template library.
import { build } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = path.join(root, 'node_modules/.qth-samples');
await build({ configFile: false, logLevel: 'warn', resolve: { alias: { '@': path.join(root, 'src') } },
  publicDir: false, build: { outDir: tmp, emptyOutDir: true, ssr: path.join(root, 'scripts/samples-entry.ts'), rollupOptions: { output: { entryFileNames: 'samples.mjs' } } } });
const m = await import(pathToFileURL(path.join(tmp, 'samples.mjs')).href);
const d = m.sampleData();
const now = Date.now();
fs.mkdirSync(path.join(root, 'samples'), { recursive: true });
fs.writeFileSync(path.join(root, 'samples/sample-snippets.json'), JSON.stringify({ format: 'quicktext-hub', version: 1, exportedAt: now, snippets: d.snippets, folders: d.folders, tables: d.tables, workflows: d.workflows }, null, 2));
const lib = m.LIBRARY.map((t) => ({ id: 'tpl_' + t.id.replace(/^lib-/, '').replace(/-/g, '_'), name: t.name, shortcut: t.shortcut, content: t.content, contentType: t.contentType, description: t.description, folderId: null, tags: [t.category], enabled: true, favorite: false, pinned: false, createdAt: now, updatedAt: now }));
fs.writeFileSync(path.join(root, 'samples/template-library.json'), JSON.stringify({ format: 'quicktext-hub', version: 1, exportedAt: now, snippets: lib, folders: [] }, null, 2));
fs.writeFileSync(path.join(root, 'samples/customers.csv'), 'Name,Email,Phone,Plan\nAisha Khan,aisha@example.com,+91 98765 43210,Pro\nDaniel Brooks,daniel@example.com,+1 415 555 0134,Basic\nMei Lin,mei@example.com,+65 8123 4567,Enterprise\n');
console.log('samples written:', d.snippets.length, 'sample snippets,', lib.length, 'library templates');
