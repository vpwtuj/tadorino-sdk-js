import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
await rm(path.join(root, 'dist'), { recursive: true, force: true });
await rm(path.join(root, '.types'), { recursive: true, force: true });
const common = { absWorkingDir: root, entryPoints: ['src/index.js'], bundle: true, platform: 'neutral', target: 'es2022', sourcemap: false, legalComments: 'none' };
await build({ ...common, format: 'esm', outfile: 'dist/index.js' });
await build({ ...common, format: 'cjs', outfile: 'dist/index.cjs' });
execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.types.json'], { cwd: root, stdio: 'inherit' });
for (const format of ['esm', 'cjs']) {
  const target = path.join(root, 'dist', format);
  await mkdir(target, { recursive: true });
  for (const file of await readdir(path.join(root, '.types'))) {
    if (!file.endsWith('.d.ts')) throw new Error('Unexpected declaration output.');
    let content = await readFile(path.join(root, '.types', file), 'utf8');
    if (format === 'cjs') content = content.replace(/(["'])(\.[^"']*)\.js\1/g, '$1$2.cjs$1');
    await writeFile(path.join(target, format === 'esm' ? file : file.replace(/\.d\.ts$/, '.d.cts')), content);
  }
}
await rm(path.join(root, '.types'), { recursive: true, force: true });
