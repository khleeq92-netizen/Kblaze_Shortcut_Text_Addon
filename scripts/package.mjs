// Creates release/quicktext-hub-<version>.zip from dist/ (uses the system "zip" if present,
// otherwise a minimal built-in ZIP writer).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const target = process.argv.includes('--target=firefox') ? 'firefox' : 'chrome';
const unpacked = process.argv.includes('--unpacked');
const src = path.join(root, target === 'firefox' ? 'dist-firefox' : 'dist');
const outDir = path.join(root, 'release');
fs.mkdirSync(outDir, { recursive: true });
if (unpacked) {
  const dest = path.join(outDir, `quicktext-hub-unpacked${target === 'firefox' ? '-firefox' : ''}`);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log('Unpacked extension folder:', path.relative(root, dest));
  process.exit(0);
}
const out = path.join(outDir, `quicktext-hub-${target}-${pkg.version}.zip`);
fs.rmSync(out, { force: true });

function walk(dir, base = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(path.join(dir, d.name), base + d.name + '/') : [base + d.name]);
}

try {
  execFileSync('zip', ['-r', '-X', '-q', out, '.'], { cwd: src });
} catch {
  // Fallback ZIP writer (deflate, no external tools).
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0;
  });
  const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const locals = []; const centrals = []; let offset = 0;
  for (const rel of walk(src)) {
    const data = fs.readFileSync(path.join(src, rel));
    const comp = zlib.deflateRawSync(data);
    const name = Buffer.from(rel);
    const crc = crc32(data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(0, 10); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, name, comp);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(0, 12); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28);
    ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32); ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38); ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += 30 + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(centrals.length / 2, 8); end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  fs.writeFileSync(out, Buffer.concat([...locals, cd, end]));
}
console.log('Packaged', path.relative(root, out), `(${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
