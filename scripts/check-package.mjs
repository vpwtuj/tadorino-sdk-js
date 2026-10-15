import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { startFixture } from './fixture-server.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(path.join(os.tmpdir(), 'tadorino-sdk-pack-'));
const execFileAsync = promisify(execFile);
const run = async (cmd, args, cwd) => (await execFileAsync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 })).stdout;
try {
  const packed = JSON.parse(await run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', temporary], root))[0];
  assert.equal(packed.name, '@bright203/tadorino-sdk-js');
  const sourceManifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(packed.version, sourceManifest.version);
  for (const { path: file } of packed.files) {
    assert(/^(?:package\.json|README\.md|LICENSE|dist\/index\.(?:js|cjs)|dist\/(?:esm\/[^/]+\.d\.ts|cjs\/[^/]+\.d\.cts))$/.test(file), `Unexpected package file: ${file}`);
  }
  const tarball = path.join(temporary, packed.filename);
  const digest = createHash('sha256').update(await readFile(tarball)).digest('hex');
  // Exercise the actual npm CLI parser with the same ./release-package path as
  // production. A bare owner/name relative path is parsed as GitHub shorthand.
  const publicationDirectory = path.join(temporary, 'release-package');
  await mkdir(publicationDirectory);
  await cp(tarball, path.join(publicationDirectory, packed.filename));
  assert.equal((await readdir(publicationDirectory)).length, 1);
  const emptyConfig = path.join(temporary, 'empty-publish.npmrc');
  await writeFile(emptyConfig, '');
  const previewOutput = JSON.parse(await run('npm', ['publish', `./release-package/${packed.filename}`, '--dry-run', '--ignore-scripts', '--access', 'public', '--json', '--userconfig', emptyConfig], temporary));
  // npm 11 keys publish previews by package name; older CLI output can be a
  // single manifest or an array. All forms must identify this exact archive.
  const preview = Array.isArray(previewOutput) ? previewOutput[0] : previewOutput[packed.name] ?? previewOutput;
  assert.equal(preview.name, packed.name); assert.equal(preview.version, packed.version);
  assert.equal(preview.integrity, packed.integrity);
  assert.equal(createHash('sha256').update(await readFile(path.join(publicationDirectory, packed.filename))).digest('hex'), digest);
  const app = path.join(temporary, 'consumer');
  await mkdir(app);
  await writeFile(path.join(app, 'package.json'), JSON.stringify({ name: 'sdk-package-fixture', private: true, type: 'module', dependencies: { '@bright203/tadorino-sdk-js': `file:${tarball}` } }));
  await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], app);
  const installed = path.join(app, 'node_modules/@bright203/tadorino-sdk-js');
  const metadata = JSON.parse(await readFile(path.join(installed, 'package.json'), 'utf8'));
  assert.equal(metadata.dependencies, undefined);
  assert.equal(metadata.exports['.'].import.types, './dist/esm/index.d.ts');
  assert.equal(metadata.exports['.'].require.types, './dist/cjs/index.d.cts');
  assert.equal(metadata.scripts.postinstall, undefined);
  assert.equal(await readFile(path.join(installed, 'dist/index.js'), 'utf8'), await readFile(path.join(root, 'dist/index.js'), 'utf8'));
  const { default: config } = await import(new URL('../typedoc.config.mjs', import.meta.url));
  assert.deepEqual(config.entryPoints, ['src/index.js']);
  const fixture = await startFixture();
  try {
    const readme = await readFile(path.join(root, 'README.md'), 'utf8');
    const match = readme.match(/<!-- executable: memo-example -->\n```js\n([\s\S]*?)\n```/);
    assert(match, 'The README executable example must exist.');
    await writeFile(path.join(app, 'readme-example.mjs'), match[1]);
    const checks = `import assert from 'node:assert/strict';
process.env.TADORINO_BASE_URL = ${JSON.stringify(fixture.baseUrl)};
process.env.TADORINO_ACCESS_TOKEN = 'synthetic-readme-token';
const { saved, found, note } = await import('./readme-example.mjs');
assert.equal(saved.created, true);
assert.equal(found.items[0].note_id, saved.note_id);
assert.equal(note.body, ${JSON.stringify('## メモ\n原文と出典を保存する。')});
assert.equal(note.sources[0].url, 'https://example.com/reference');
`;
    await writeFile(path.join(app, 'esm.mjs'), checks);
    await run(process.execPath, ['esm.mjs'], app);
    await writeFile(path.join(app, 'cjs.cjs'), `const assert = require('node:assert/strict');
const { TadorinoClient, TadorinoError } = require('@bright203/tadorino-sdk-js');
assert.equal(typeof TadorinoClient, 'function');
const client = new TadorinoClient({ baseUrl: ${JSON.stringify(fixture.baseUrl)}, getAccessToken: () => 'synthetic-readme-token' });
(async () => { const result = await client.searchNotes({ query: 'SDK' }); assert.equal(result.items.length, 1); try { await client.getNote('invalid'); assert.fail(); } catch (error) { assert(error instanceof TadorinoError); assert.equal(error.kind, 'input'); } })().catch(() => { process.exitCode = 1; });
`);
    await run(process.execPath, ['cjs.cjs'], app);
    assert.equal(fixture.counts.create, 1);
    assert.equal(fixture.counts.search, 2);
    assert.equal(fixture.counts.get, 1);
  } finally { await fixture.close(); }
  const types = `const client = new sdk.TadorinoClient({ baseUrl: 'https://notes.example.com', getAccessToken: async ({ signal }) => { void signal; return 'synthetic-token'; } });
void client.createNote({ title: 'type', body: 'synthetic', idempotency_key: 'key' });
void client.searchNotes({ query: 'type' });
void client.getNote('id', { signal: new AbortController().signal });
// @ts-expect-error title must be a string
void client.createNote({ title: 42, body: 'synthetic', idempotency_key: 'key' });
// @ts-expect-error no invented public method
void client.deleteNote('id');
const source: sdk.Source = { title: 'synthetic' }; void source;
`;
  await writeFile(path.join(app, 'types.mts'), `import * as sdk from '@bright203/tadorino-sdk-js';
${types}`);
  await writeFile(path.join(app, 'types.cts'), `import sdk = require('@bright203/tadorino-sdk-js');
${types}`);
  await run(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2022', 'types.mts', 'types.cts'], app);
  for (const name of ['vite', 'express', 'm2m']) {
    const example = path.join(temporary, name);
    await cp(path.join(root, 'examples', name), example, { recursive: true, filter: source => !/(?:^|\/)(?:node_modules|dist|\.env(?:\..*)?|tsconfig\.tsbuildinfo)(?:\/|$)/.test(source) || source.endsWith('.env.example') });
    const manifest = JSON.parse(await readFile(path.join(example, 'package.json'), 'utf8'));
    manifest.dependencies['@bright203/tadorino-sdk-js'] = `file:${tarball}`;
    await writeFile(path.join(example, 'package.json'), JSON.stringify(manifest));
    await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], example);
    const sdkFiles = path.join(example, 'node_modules/@bright203/tadorino-sdk-js/dist/index.js');
    assert.equal(await readFile(sdkFiles, 'utf8'), await readFile(path.join(installed, 'dist/index.js'), 'utf8'));
    await run('npm', ['run', 'check'], example);
  }
  // This example uses only the public 0.1.0 API: also test a fresh, exact
  // registry install rather than accidentally relying on a new source export.
  const legacy = path.join(temporary, 'm2m-published-0.1.0');
  await cp(path.join(root, 'examples/m2m'), legacy, { recursive: true, filter: source => !/(?:^|\/)(?:node_modules|dist|\.env(?:\..*)?|tsconfig\.tsbuildinfo)(?:\/|$)/.test(source) || source.endsWith('.env.example') });
  const legacyManifest = JSON.parse(await readFile(path.join(legacy, 'package.json'), 'utf8'));
  legacyManifest.dependencies['@bright203/tadorino-sdk-js'] = '0.1.0';
  await writeFile(path.join(legacy, 'package.json'), JSON.stringify(legacyManifest));
  await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org'], legacy);
  assert.equal(JSON.parse(await readFile(path.join(legacy, 'node_modules/@bright203/tadorino-sdk-js/package.json'), 'utf8')).version, '0.1.0');
  await run('npm', ['run', 'check'], legacy);
  await mkdir(path.join(root, '.artifacts'), { recursive: true });
  await writeFile(path.join(root, '.artifacts/package-verification.json'), JSON.stringify({ package: packed.name, version: packed.version, tarballSha256: digest, node: process.version, npmPublishDryRun: true, esm: true, commonjs: true, nodeNextTypes: true, readmeExample: true, reactViteBuild: true, expressSessionFixture: true, machineExample: true, publishedVersionCompatibility: '0.1.0', syntheticOnly: true }, null, 2) + '\n');
  console.log(`Packed SDK ${packed.version}: ESM, CommonJS, NodeNext types, README, React/Vite, user-session Express and local M2M examples verified from one tarball.`);
} finally { await rm(temporary, { recursive: true, force: true }); }
