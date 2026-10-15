import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createServer as createVite } from 'vite';
import { startDev } from './dev.mjs';

test('occupied backend port fails before starting a frontend that could proxy to the wrong machine', async t => {
  const occupied = createServer(); occupied.listen(0, '127.0.0.1'); await once(occupied, 'listening');
  t.after(() => new Promise(resolve => occupied.close(resolve)));
  let frontends = 0;
  await assert.rejects(startDev({
    startBackend: () => createServer().listen(occupied.address().port, '127.0.0.1'),
    createFrontend: async () => { frontends++; assert.fail('must not start a frontend'); },
  }), /configuration and ports/);
  assert.equal(frontends, 0);
});

test('occupied frontend port closes the newly started backend and the failed Vite server', async t => {
  const occupied = createServer(); occupied.listen(0, '127.0.0.1'); await once(occupied, 'listening');
  t.after(() => new Promise(resolve => occupied.close(resolve)));
  let backend;
  await assert.rejects(startDev({
    startBackend: () => { backend = createServer().listen(0, '127.0.0.1'); return backend; },
    createFrontend: () => createVite({ configFile: false, logLevel: 'silent', server: { host: '127.0.0.1', port: occupied.address().port, strictPort: true } }),
  }), /configuration and ports/);
  assert.equal(backend.listening, false);
});
