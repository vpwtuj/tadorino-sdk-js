import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

test('built frontend contains only local API paths, never the server token acquisition code', async () => {
  const assets = new URL('./dist/assets/', import.meta.url);
  const files = (await readdir(assets)).filter(file => file.endsWith('.js'));
  assert(files.length > 0, 'Build the example before checking its browser boundary.');
  const bundle = (await Promise.all(files.map(file => readFile(new URL(file, assets), 'utf8')))).join('\n');
  assert(bundle.includes('/api/bootstrap')); assert(bundle.includes('/api/notes'));
  for (const serverOnly of ['/oauth/token', 'client_credentials', 'client_secret', 'AUTH0_CLIENT_SECRET', 'synthetic-server-only-secret']) {
    assert(!bundle.includes(serverOnly), `Server-only credential code must not enter the browser: ${serverOnly}`);
  }
});
