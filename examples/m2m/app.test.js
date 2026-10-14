import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createApp } from './app.js';
import { createTokenProvider } from './token-provider.js';

const frontendOrigin = 'http://127.0.0.1:5174';
const config = { issuer: 'https://tenant.example.com/', clientId: 'synthetic-client', clientSecret: 'synthetic-secret', audience: 'https://notes.example.com/mcp' };
const minted = () => Response.json({ access_token: 'synthetic-machine-token', token_type: 'Bearer', expires_in: 100 });
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
async function start(t, options) {
  const app = createApp({ baseUrl: 'https://notes.example.com', ...options });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const bootstrap = await fetch(`${base}/api/bootstrap`, { headers: { Accept: 'application/json' } });
  assert.equal(bootstrap.status, 200); const initial = await bootstrap.json();
  assert.deepEqual(Object.keys(initial).sort(), ['csrf', 'mode']); assert.equal(initial.mode, 'local-machine');
  const headers = { Accept: 'application/json', Origin: frontendOrigin, 'Content-Type': 'application/json', 'X-Tadorino-CSRF': initial.csrf };
  const call = (path, value) => fetch(`${base}${path}`, { method: value === undefined ? 'GET' : 'POST', headers, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
  return { base, headers, call };
}

test('React bridge saves/replays/searches/gets through the unchanged SDK with one machine token', async t => {
  let mintedCount = 0; const records = new Map(); let original;
  const getAccessToken = createTokenProvider(config, { fetch: async () => { mintedCount++; return minted(); } });
  const { call } = await start(t, { getAccessToken, fetch: async (url, init) => {
    assert.equal(init.headers.Authorization, 'Bearer synthetic-machine-token');
    const input = init.body ? JSON.parse(init.body) : undefined;
    if (url.endsWith('/v1/notes')) {
      if (records.has(input.idempotency_key)) { assert.deepEqual(input, original); return Response.json({ ...records.get(input.idempotency_key), created: false }); }
      original = input; const saved = { note_id: randomUUID(), title: input.title, created_at: '2026-10-15T00:00:00.000Z' }; records.set(input.idempotency_key, saved);
      return Response.json({ ...saved, created: true }, { status: 201 });
    }
    const saved = [...records.values()][0];
    if (url.endsWith('/search')) return Response.json({ items: [{ ...saved, snippet: original.body }], has_more: false });
    return Response.json({ ...saved, body: original.body, sources: [] });
  } });
  const input = { title: '機械 test', body: '## 原文\n全角 ＡＢＣ 😀', idempotency_key: randomUUID() };
  const created = await (await call('/api/notes', input)).json(); assert.equal(created.created, true);
  assert.equal((await (await call('/api/notes', input)).json()).created, false);
  const found = await (await call('/api/notes/search', { query: '機械' })).json(); assert.equal(found.items[0].note_id, created.note_id);
  const result = await call(`/api/notes/${created.note_id}`); const note = await result.json(); assert.equal(note.body, input.body);
  assert.equal(mintedCount, 1); assert(!JSON.stringify(note).includes('synthetic-machine-token')); assert.equal(result.headers.get('cache-control'), 'no-store');
});

test('Host, Origin, Fetch Metadata, CSRF and non-JSON requests fail before token acquisition', async t => {
  let tokens = 0; const { base, headers } = await start(t, { getAccessToken: async () => { tokens++; return 'synthetic-token'; }, fetch: async () => { assert.fail('must not call REST'); } });
  const wrongHost = await new Promise(resolve => {
    const req = request(`${base}/api/notes/search`, { method: 'POST', headers: { ...headers, Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); });
    req.end('{"query":"test"}');
  });
  assert.equal(wrongHost, 403);
  const cases = [ { Origin: 'https://evil.example' }, { 'Sec-Fetch-Site': 'cross-site' }, { Cookie: 'session=synthetic' },
    { Authorization: 'Bearer synthetic-browser-token' }, { 'X-User-Id': 'invented' }, { 'X-Tadorino-CSRF': '' }, { 'Content-Type': 'text/plain' }, { Origin: '' },
  ];
  for (const extra of cases) { const result = await fetch(`${base}/api/notes/search`, { method: 'POST', headers: { ...headers, ...extra }, body: '{"query":"test"}' }); assert.equal(result.status, 403, JSON.stringify(extra)); }
  const badJson = await fetch(`${base}/api/notes/search`, { method: 'POST', headers, body: '{broken' }); assert.equal(badJson.status, 400);
  const options = await fetch(`${base}/api/notes`, { method: 'OPTIONS', headers }); assert.equal(options.status, 405);
  assert.equal(tokens, 0);
});

test('authorization-service failures use safe 502/503 and do not expose OAuth bodies', async t => {
  for (const upstream of [401, 429, 503]) {
    let requests = 0;
    const provider = createTokenProvider(config, { fetch: async () => { requests++; return new Response('synthetic-secret access_token private body', { status: upstream }); } });
    const { call } = await start(t, { getAccessToken: provider, fetch: async () => { assert.fail('must not call memo REST'); } });
    const result = await call('/api/notes/search', { query: 'test' });
    assert.equal(result.status, upstream === 401 ? 502 : 503); const text = await result.text(); assert(!/synthetic|access_token|private/.test(text)); assert.equal(requests, 1);
  }
});

test('route aliases, query parameters and GET bodies cannot reach the machine SDK', async t => {
  let tokens = 0;
  const { base, headers } = await start(t, { getAccessToken: () => { tokens++; return 'synthetic-token'; }, fetch: async () => { assert.fail('must not call REST'); } });
  for (const path of ['/API/NOTES/SEARCH', '/api/notes/search/', '/api/notes/search?unexpected=1']) {
    const result = await fetch(`${base}${path}`, { method: 'POST', headers, body: '{"query":"test"}' }); assert([400, 404].includes(result.status));
  }
  const body = await new Promise(resolve => {
    const req = request(`${base}/api/bootstrap`, { method: 'GET', headers: { ...headers, 'Content-Length': '2' } }, res => { res.resume(); resolve(res.statusCode); }); req.end('{}');
  });
  assert.equal(body, 400); assert.equal(tokens, 0);
});

test('malformed successful REST responses and stalled bodies never become successful local responses', async t => {
  for (const upstream of [() => Response.json({ not: 'a search result' }), () => new Response(new ReadableStream({}), { headers: { 'content-type': 'application/json' } })]) {
    const { call } = await start(t, { timeoutMs: 50, getAccessToken: () => 'synthetic-token', fetch: async () => upstream() });
    const result = await call('/api/notes/search', { query: 'test' }); assert([502, 504].includes(result.status)); assert(!result.ok);
  }
});

test('disconnect while waiting for a shared token prevents that save and leaves other waiters alive', async t => {
  const gate = deferred(); const started = deferred(); const disconnected = deferred(); let memoCalls = 0; let mintedCount = 0;
  const provider = createTokenProvider(config, { fetch: async () => { mintedCount++; started.resolve(); return gate.promise; } });
  const { base, headers, call } = await start(t, { getAccessToken: context => { context.signal.addEventListener('abort', () => disconnected.resolve(), { once: true }); return provider(context); }, fetch: async () => { memoCalls++; return Response.json({ items: [], has_more: false }); } });
  const abandoned = request(`${base}/api/notes`, { method: 'POST', headers }, () => {}); abandoned.on('error', () => {});
  abandoned.end(JSON.stringify({ title: 'cancel', body: 'synthetic', idempotency_key: randomUUID() })); await started.promise;
  const second = call('/api/notes/search', { query: 'test' }); abandoned.destroy(); await disconnected.promise;
  gate.resolve(minted()); assert.equal((await second).status, 200); assert.equal(mintedCount, 1); assert.equal(memoCalls, 1);
});
