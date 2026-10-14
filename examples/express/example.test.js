import assert from 'node:assert/strict';
import test from 'node:test';
import { request } from 'node:http';
import { createApp } from './app.js';

const noteId = '33333333-3333-4333-8333-333333333333';
const createdAt = '2026-10-14T00:00:00.000Z';

test('Express binds parallel requests to independent authenticated sessions and maps all three SDK operations', async () => {
  const calls = [];
  const payloads = new Map();
  const app = createApp({
    baseUrl: 'https://notes.example.com',
    resolveSession: async req => req.headers['x-test-session'] ? {
      userId: req.headers['x-test-session'],
      getAccessToken: async () => { await new Promise(resolve => setTimeout(resolve, req.headers['x-test-session'] === 'alice' ? 20 : 1)); return `synthetic-${req.headers['x-test-session']}`; },
    } : null,
    fetch: async (url, init) => {
      const actor = init.headers.Authorization;
      const input = init.body ? JSON.parse(init.body) : null;
      calls.push({ url, actor });
      if (url.endsWith('/search')) return Response.json({ items: [{ note_id: noteId, title: actor, snippet: 'synthetic memo', created_at: createdAt }], has_more: false });
      if (init.method === 'POST') { payloads.set(actor, input); return Response.json({ note_id: noteId, title: input.title, created_at: createdAt, created: true }, { status: 201 }); }
      return Response.json({ note_id: noteId, title: actor, body: payloads.get(actor)?.body ?? 'synthetic memo', sources: [], created_at: createdAt });
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/notes/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
    const search = session => fetch(`${base}/api/notes/search`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-session': session }, body: JSON.stringify({ query: 'synthetic' }) }).then(response => response.json());
    const [alice, bob] = await Promise.all([search('alice'), search('bob')]);
    assert.equal(alice.items[0].title, 'Bearer synthetic-alice');
    assert.equal(bob.items[0].title, 'Bearer synthetic-bob');
    const saved = await fetch(`${base}/api/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-session': 'alice' }, body: JSON.stringify({ title: 'Express SDK', body: '## synthetic memo', idempotency_key: noteId }) }).then(response => response.json());
    assert.equal(saved.note_id, noteId);
    const note = await fetch(`${base}/api/notes/${noteId}`, { headers: { 'x-test-session': 'alice' } }).then(response => response.json());
    assert.equal(note.body, '## synthetic memo');
    assert.equal(calls.length, 4);
  } finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});


test('malformed successful upstream JSON is a downstream 502 failure', async () => {
  const app = createApp({ baseUrl: 'https://notes.example.com', resolveSession: async () => ({ userId: 'synthetic-user', getAccessToken: async () => 'synthetic-token' }), fetch: async () => Response.json({ wrong: 'shape' }, { status: 200 }) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/notes/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'synthetic' }) });
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error, 'invalid_response');
  } finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});


test('an upstream body deadline carrying HTTP 200 becomes downstream 504', async () => {
  const app = createApp({ baseUrl: 'https://notes.example.com', timeoutMs: 15, resolveSession: async () => ({ userId: 'synthetic-user', getAccessToken: async () => 'synthetic-token' }), fetch: async () => new Response(new ReadableStream({ start() {} }), { status: 200, headers: { 'Content-Type': 'application/json' } }) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/notes/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'synthetic' }) });
    assert.equal(response.status, 504);
    assert.equal((await response.json()).error, 'timeout');
  } finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

test('disconnect during session resolution never starts token acquisition or memo traffic', async () => {
  let resolveSession;
  let sessionStarted;
  const started = new Promise(resolve => { sessionStarted = resolve; });
  const pending = new Promise(resolve => { resolveSession = resolve; });
  let tokenCalls = 0;
  let fetchCalls = 0;
  const app = createApp({ baseUrl: 'https://notes.example.com', resolveSession: async () => { sessionStarted(); return pending; }, fetch: async () => { fetchCalls++; return Response.json({}); } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const client = request(`http://127.0.0.1:${server.address().port}/api/notes/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    client.on('error', () => {});
    client.end(JSON.stringify({ query: 'synthetic' }));
    await started;
    client.destroy();
    await new Promise(resolve => setTimeout(resolve, 20));
    resolveSession({ userId: 'synthetic-user', getAccessToken: async () => { tokenCalls++; return 'synthetic-token'; } });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(tokenCalls, 0);
    assert.equal(fetchCalls, 0);
  } finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
