import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
test('public packaging has branch-correct declarations and no mandatory runtime dependencies', async () => {
  const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  assert.equal(manifest.name, '@bright203/tadorino-sdk-js');
  assert.equal(manifest.version, '0.1.0');
  assert.equal(manifest.dependencies, undefined);
  assert.deepEqual(Object.keys(manifest.exports), ['.']);
  assert.equal(manifest.exports['.'].import.default, './dist/index.js');
  assert.equal(manifest.exports['.'].require.default, './dist/index.cjs');
  assert.equal(manifest.exports['.'].import.types, './dist/esm/index.d.ts');
  assert.equal(manifest.exports['.'].require.types, './dist/cjs/index.d.cts');
  assert.equal(manifest.sideEffects, false);
  assert.equal(manifest.scripts.postinstall, undefined);
  const license = await readFile(new URL('LICENSE', root), 'utf8');
  assert(license.startsWith('MIT License'));
  assert(license.includes('Copyright (c) 2026 BRIGHT203 Co., ltd.'));
});

test('public documentation uses only the public entry and requires coverage and link validation', async () => {
  const { default: config } = await import('../typedoc.config.mjs');
  assert.deepEqual(config.entryPoints, ['src/index.js']);
  assert.equal(config.excludeInternal, true);
  assert.equal(config.validation.notDocumented, true);
  assert.equal(config.validation.invalidLink, true);
  assert.equal(config.treatWarningsAsErrors, true);
  assert.equal(config.treatValidationWarningsAsErrors, true);
  const readme = await readFile(new URL('README.md', root), 'utf8');
  assert(readme.includes('<!-- executable: memo-example -->'));
});
