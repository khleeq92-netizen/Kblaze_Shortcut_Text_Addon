import { build } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
for (const name of ['editors', 'react-input']) {
  await build({
    configFile: false, logLevel: 'warn',
    build: { outDir: path.join(here, 'fixtures/build'), emptyOutDir: false, lib: { entry: path.join(here, `fixtures/${name}.ts`), formats: ['iife'], name: 'fx_' + name.replace('-', '_'), fileName: () => name + '.js' }, minify: false },
  });
}
console.log('fixtures built');
