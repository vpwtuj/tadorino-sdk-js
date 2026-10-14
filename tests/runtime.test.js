import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TadorinoClient, TadorinoError } from '../src/index.js';

const ID = '11111111-1111-4111-8111-111111111111';
const KEY = '22222222-2222-4222-8222-222222222222';
const TIME = '2026-10-14T01:02:03.123456Z';
const TOKEN = 'synthetic-access-token';
const SAVE = { title: '合成メモ', body: '## 原文\n  Ａ🙂\n', sources: [{ title: '資料', url: 'https://example.com/source' }], idempotency_key: KEY };
const SAVED = { note_id: ID, title: SAVE.title, created_at: TIME, created: true };
const NOTE = { note_id: ID, title: SAVE.title, body: SAVE.body, sources: SAVE.sources, created_at: TIME };
const MATCH = { note_id: ID, title: SAVE.title, snippet: SAVE.body, created_at: TIME };
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';

function response(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-Request-ID': REQUEST_ID, ...headers } });
}
function client(fetch, options = {}) {
  return new TadorinoClient({ baseUrl: 'https://notes.example.com', getAccessToken: () => TOKEN, fetch, ...options });
}
function expectError(kind, operation, metadata = {}) {
  return error => {
    assert.ok(error instanceof TadorinoError);
    assert.equal(error.name, 'TadorinoError');
    assert.equal(error.kind, kind);
    assert.equal(error.operation, operation);
    assert.equal('cause' in error, false);
    for (const [key, value] of Object.entries(metadata)) assert.equal(error[key], value);
    assert.doesNotMatch(JSON.stringify(error), /synthetic-access-token|LEAK|raw-secret|example\.com/);
    return true;
  };
}

test('three operations and replay have fixed HTTP contract, original input, and no shared token', async () => {
  const calls = [];
  let tokens = 0;
  const sdk = client(async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/search')) return response({ items: [MATCH], has_more: false });
    if (init.method === 'GET') return response(NOTE);
    return response({ ...SAVED, created: calls.length === 1 }, calls.length === 1 ? 201 : 200);
  }, { getAccessToken: ({ signal }) => { assert.equal(signal.aborted, false); return `token-${++tokens}`; } });
  assert.deepEqual(await sdk.createNote(SAVE), SAVED);
  assert.deepEqual(await sdk.createNote(SAVE), { ...SAVED, created: false });
  assert.deepEqual(await sdk.searchNotes({ query: '  Ａ 原文 ', limit: 1 }), { items: [MATCH], has_more: false });
  assert.deepEqual(await sdk.getNote(ID.toUpperCase()), NOTE);
  assert.equal(tokens, 4);
  for (const [index, { init }] of calls.entries()) {
    assert.equal(init.headers.Accept, 'application/json');
    assert.equal(init.headers.Authorization, `Bearer token-${index + 1}`);
    assert.equal(init.credentials, 'omit');
    assert.equal(init.cache, 'no-store');
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal instanceof AbortSignal);
  }
  assert.equal(calls[0].url, 'https://notes.example.com/v1/notes');
  assert.deepEqual(JSON.parse(calls[0].init.body), SAVE);
  assert.equal(calls[2].url, 'https://notes.example.com/v1/notes/search');
  assert.equal(JSON.parse(calls[2].init.body).query, '  Ａ 原文 ');
  assert.equal(calls[3].url, `https://notes.example.com/v1/notes/${ID}`);
  assert.equal(calls[3].init.body, undefined);
  assert.equal(calls[3].init.headers['Content-Type'], undefined);
});

test('constructor rejects unsafe URLs, unknown settings, getters, invalid callback/fetch/timeouts', () => {
  const invalidUrls = ['http://example.com', 'https://example.com/v1', 'https://user:pass@example.com', 'https://example.com/?x=1', 'https://example.com/#x', '/v1', 'ftp://example.com', 'http://127.1', 'http://2130706433', 'http://localhost.evil', 'https://example.com\\', 'https://example.com/..', 'https://example.com/\t'];
  for (const baseUrl of invalidUrls) assert.throws(() => client(() => response(NOTE), { baseUrl }), expectError('configuration', null));
  for (const timeoutMs of [0, -1, 0.5, 300001, '20', undefined, null, NaN, Infinity]) assert.throws(() => client(() => response(NOTE), { timeoutMs }), expectError('configuration', null));
  for (const extra of [{ headers: {} }, { getAccessToken: undefined }, { fetch: undefined }, { fetch: null }, { getAccessToken: 'token' }]) assert.throws(() => client(() => response(NOTE), extra), expectError('configuration', null));
  const getter = { baseUrl: 'https://example.com', getAccessToken: () => TOKEN, get timeoutMs() { throw new Error('LEAK'); } };
  assert.throws(() => new TadorinoClient(getter), expectError('configuration', null));
  for (const baseUrl of ['https://example.com/', 'http://localhost:1234', 'http://127.0.0.1:1234/', 'http://[::1]:1234']) assert.doesNotThrow(() => client(() => response(NOTE), { baseUrl }));
});

test('invalid input and options are rejected asynchronously without token or fetch calls', async () => {
  let calls = 0;
  const sdk = client(() => { calls++; return response(SAVED, 201); }, { getAccessToken: () => { calls++; return TOKEN; } });
  const invalidCreates = [null, [], {}, { ...SAVE, owner: ID }, { ...SAVE, title: 2 }, { ...SAVE, body: null }, { ...SAVE, idempotency_key: undefined }, { ...SAVE, idempotency_key: 'not-uuid' }, { ...SAVE, sources: null }, { ...SAVE, sources: [{}] }, { ...SAVE, sources: [{ title: undefined }] }, { ...SAVE, sources: [{ excerpt: 1n }] }, { ...SAVE, sources: [{ toJSON() { return {}; } }] }, { ...SAVE, sources: Array(2) }, { ...SAVE, sources: Array.from({ length: 21 }, () => ({ title: 'x' })) }];
  const circular = { ...SAVE }; circular.sources = [circular]; invalidCreates.push(circular);
  const getter = { ...SAVE }; Object.defineProperty(getter, 'title', { enumerable: true, get() { throw new Error('LEAK'); } }); invalidCreates.push(getter);
  const symbol = { ...SAVE, [Symbol('unknown')]: 'LEAK' }; invalidCreates.push(symbol);
  for (const input of invalidCreates) await assert.rejects(sdk.createNote(input), expectError('input', 'createNote'));
  for (const input of [null, {}, { query: 1 }, { query: 'x', limit: 0 }, { query: 'x', limit: 21 }, { query: 'x', limit: 1.5 }, { query: 'x', limit: '1' }, { query: 'x', cursor: 'LEAK' }, { query: 'x', limit: Infinity }]) await assert.rejects(sdk.searchNotes(input), expectError('input', 'searchNotes'));
  for (const id of [KEY.replace('-4222-', '-1222-'), undefined, 1, `${ID}?x=1`]) await assert.rejects(sdk.getNote(id), expectError('input', 'getNote'));
  for (const options of [null, [], { arbitrary: true }, { timeoutMs: 0 }, { timeoutMs: '1' }, { signal: {} }, { signal: undefined }]) await assert.rejects(sdk.getNote(ID, options), expectError('input', 'getNote'));
  assert.equal(calls, 0);
});

test('general UUID idempotency keys accepted, semantic string validation remains with server', async () => {
  let sent;
  const sdk = client(async (_, init) => { sent = JSON.parse(init.body); return response(SAVED, 201); });
  await sdk.createNote({ title: '  ', body: '\0\ud800', sources: [{ url: 'server-validates-source-url' }], idempotency_key: '22222222-2222-1222-2222-222222222222' });
  assert.equal(sent.title, '  ');
  assert.equal(sent.body, '\0\ud800');
});

test('request snapshot is immutable across asynchronous token wait and caller input is not changed', async () => {
  let provide;
  const waiting = new Promise(resolve => { provide = resolve; });
  let sent;
  const input = structuredClone(SAVE);
  const sdk = client(async (_, init) => { sent = JSON.parse(init.body); return response(SAVED, 201); }, { getAccessToken: () => waiting });
  const pending = sdk.createNote(input);
  assert.deepEqual(input, SAVE);
  input.title = 'changed'; input.body = 'changed'; input.sources[0].title = 'changed'; input.sources.push({ title: 'new' });
  provide(TOKEN);
  await pending;
  assert.deepEqual(sent, SAVE);
});

test('request UTF8 size bound is checked before authentication', async () => {
  let tokens = 0;
  const sdk = client(() => response(SAVED, 201), { getAccessToken: () => { tokens++; return TOKEN; } });
  await assert.rejects(sdk.createNote({ ...SAVE, body: '🙂'.repeat(70_000) }), expectError('input', 'createNote'));
  await assert.rejects(sdk.searchNotes({ query: '\n'.repeat(150_000) }), expectError('input', 'searchNotes'));
  assert.equal(tokens, 0);
});

test('token failures are safe, retrieved once, and never invoke fetch', async () => {
  for (const value of ['', ' ', 'a b', 'a\nb', 'a\rb', null, 1, {}, undefined]) {
    let calls = 0;
    const sdk = client(() => { throw new Error('must not fetch'); }, { getAccessToken: () => { calls++; return value; } });
    await assert.rejects(sdk.getNote(ID), expectError('auth', 'getNote'));
    assert.equal(calls, 1);
  }
  for (const callback of [() => { throw new Error('LEAK raw-secret'); }, async () => { throw new Error('LEAK raw-secret'); }]) await assert.rejects(client(() => response(NOTE), { getAccessToken: callback }).getNote(ID), expectError('auth', 'getNote'));
});

test('each concurrent client retains its own user token callback', async () => {
  const tokens = [];
  const fetch = async (_, init) => { tokens.push(init.headers.Authorization); return response(NOTE); };
  await Promise.all([client(fetch, { getAccessToken: async () => 'user-a' }).getNote(ID), client(fetch, { getAccessToken: async () => 'user-b' }).getNote(ID)]);
  assert.deepEqual(tokens.sort(), ['Bearer user-a', 'Bearer user-b']);
});

test('HTTP failures retain status and safe known code without retry or raw server message', async () => {
  for (const status of [400, 401, 403, 404, 409, 429, 500, 503]) {
    let fetches = 0; let tokens = 0;
    const sdk = client(async () => { fetches++; return response({ error: { code: 'idempotency_conflict', message: 'LEAK raw-secret' } }, status); }, { getAccessToken: () => { tokens++; return TOKEN; } });
    await assert.rejects(sdk.createNote(SAVE), expectError('http', 'createNote', { status, errorCode: 'idempotency_conflict', requestId: REQUEST_ID }));
    assert.equal(fetches, 1); assert.equal(tokens, 1);
  }
  for (const body of ['<html>LEAK raw-secret</html>', '', '{', JSON.stringify({ error: { code: 'LEAK', message: 'LEAK' } }), JSON.stringify({ error: { code: 'invalid_token' } })]) {
    const sdk = client(async () => new Response(body, { status: 401, headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'LEAK raw-secret' } }));
    await assert.rejects(sdk.getNote(ID), expectError('http', 'getNote', { status: 401, errorCode: null, requestId: null }));
  }
});

test('network and redirect/CORS-style failures expose no original exception', async () => {
  for (const fail of [() => { throw new Error('https://example.com/LEAK raw-secret'); }, async () => { throw new TypeError('LEAK'); }]) await assert.rejects(client(fail).getNote(ID), expectError('network', 'getNote', { status: null, errorCode: null }));
});

test('additional response fields are excluded at every layer, preserving order and text', async () => {
  const sdk = client(async (url, init) => {
    if (url.endsWith('/search')) return response({ items: [{ ...MATCH, note_id: KEY, private: 'LEAK' }, { ...MATCH, private: 'LEAK' }], has_more: false, private: 'LEAK' });
    if (init.method === 'GET') return response({ ...NOTE, sources: [{ ...SAVE.sources[0], private: 'LEAK' }], owner_id: 'LEAK', '__proto__': { injected: true } });
    return response({ ...SAVED, private: 'LEAK' }, 201);
  });
  assert.deepEqual(await sdk.createNote(SAVE), SAVED);
  assert.deepEqual(await sdk.getNote(ID), NOTE);
  const found = await sdk.searchNotes({ query: 'x', limit: 2 });
  assert.deepEqual(found.items.map(item => item.note_id), [KEY, ID]);
  assert.doesNotMatch(JSON.stringify(found), /LEAK/);
});

test('success statuses, schema fields, note identity, timestamps and known-field bounds validated', async () => {
  for (const [value, status] of [[SAVED, 200], [{ ...SAVED, created: false }, 201], [SAVED, 202], [{ ...SAVED, note_id: ID.toUpperCase().replace('11111111', 'AAAAAAAA') }, 201], [{ ...SAVED, title: '' }, 201], [{ ...SAVED, title: '🙂'.repeat(201) }, 201], [{ ...SAVED, created_at: '2026-02-30T01:02:03Z' }, 201], [{ ...SAVED, created_at: '2026-10-14T01:02:03+01:00' }, 201], [{ ...SAVED, created: 1 }, 201]]) await assert.rejects(client(() => response(value, status)).createNote(SAVE), expectError('invalid_response', 'createNote', { status }));
  for (const value of [{ ...NOTE, note_id: KEY }, { ...NOTE, body: null }, { ...NOTE, body: '\n  ' }, { ...NOTE, body: '\0' }, { ...NOTE, body: '\ud800' }, { ...NOTE, body: '🙂'.repeat(20001) }, { ...NOTE, sources: [{ unknown: 'LEAK' }] }, { ...NOTE, sources: [{ title: 1 }] }, { ...NOTE, sources: [{ title: ' ' }] }, { ...NOTE, sources: [{ url: '/relative' }] }, { ...NOTE, sources: [{ url: 'file:///example' }] }, { ...NOTE, sources: Array.from({ length: 21 }, () => ({ title: 'x' })) }]) await assert.rejects(client(() => response(value)).getNote(ID), expectError('invalid_response', 'getNote'));
  for (const value of [{ items: [MATCH, MATCH], has_more: false }, { items: [MATCH], has_more: 'false' }, { items: [{ ...MATCH, snippet: '🙂'.repeat(201) }], has_more: false }, { items: [{ note_id: ID }], has_more: false }]) await assert.rejects(client(() => response(value)).searchNotes({ query: 'x', limit: 1 }), expectError('invalid_response', 'searchNotes'));
  assert.deepEqual(await client(() => response({ items: [], has_more: false })).searchNotes({ query: 'x' }), { items: [], has_more: false });
  assert.equal((await client(() => response({ ...NOTE, created_at: '2026-10-14T01:02:03+00:00' })).getNote(ID)).created_at, '2026-10-14T01:02:03+00:00');
});

test('successful malformed, empty, wrong-media or invalid UTF8 bodies are invalid_response', async () => {
  for (const make of [() => new Response('', { headers: { 'Content-Type': 'application/json' } }), () => new Response('{', { headers: { 'Content-Type': 'application/json' } }), () => new Response(JSON.stringify(NOTE), { headers: { 'Content-Type': 'text/plain' } }), () => new Response(new Uint8Array([0xff]), { headers: { 'Content-Type': 'application/json' } }), () => new Response(null, { status: 204 })]) await assert.rejects(client(make).getNote(ID), expectError('invalid_response', 'getNote'));
});

test('already cancelled signal avoids token and network', async () => {
  let calls = 0; const controller = new AbortController(); controller.abort(new Error('LEAK'));
  const sdk = client(() => { calls++; return response(NOTE); }, { getAccessToken: () => { calls++; return TOKEN; } });
  await assert.rejects(sdk.getNote(ID, { signal: controller.signal }), expectError('aborted', 'getNote'));
  assert.equal(calls, 0);
});

test('abort ends uncooperative token callback and late successful token never starts fetch', async () => {
  let provide; let callbackSignal; let fetches = 0;
  const controller = new AbortController();
  const waiting = new Promise(resolve => { provide = resolve; });
  const sdk = client(() => { fetches++; return response(NOTE); }, { getAccessToken: ({ signal }) => { callbackSignal = signal; return waiting; } });
  const pending = sdk.getNote(ID, { signal: controller.signal });
  controller.abort('LEAK');
  await assert.rejects(pending, expectError('aborted', 'getNote'));
  assert.equal(callbackSignal.aborted, true);
  provide(TOKEN); await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(fetches, 0);
});

test('timeout ends uncooperative token callback and delayed rejection remains handled', async () => {
  let fail; let callbackSignal; let fetches = 0;
  const waiting = new Promise((_, reject) => { fail = reject; });
  const sdk = client(() => { fetches++; return response(NOTE); }, { timeoutMs: 10, getAccessToken: ({ signal }) => { callbackSignal = signal; return waiting; } });
  await assert.rejects(sdk.getNote(ID), expectError('timeout', 'getNote'));
  assert.equal(callbackSignal.aborted, true);
  fail(new Error('LEAK')); await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(fetches, 0);
});

test('operation timeout covers token wait and network with one deadline and per-call overrides', async () => {
  let fetchSignal;
  const sdk = client(async (_, init) => { fetchSignal = init.signal; return new Promise(() => {}); }, { timeoutMs: 60_000, getAccessToken: async () => { await new Promise(resolve => setTimeout(resolve, 8)); return TOKEN; } });
  await assert.rejects(sdk.getNote(ID, { timeoutMs: 15 }), expectError('timeout', 'getNote'));
  assert.equal(fetchSignal.aborted, true);
});

test('cancellation of uncooperative fetch cancels a late response body', async () => {
  let provide; let cancelled = 0;
  const waiting = new Promise(resolve => { provide = resolve; });
  const controller = new AbortController();
  const sdk = client(() => waiting);
  const pending = sdk.getNote(ID, { signal: controller.signal });
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  controller.abort();
  await assert.rejects(pending, expectError('aborted', 'getNote'));
  provide(new Response(new ReadableStream({ cancel() { cancelled++; } })));
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(cancelled, 1);
});

test('body timeout and caller cancellation retain known HTTP status/requestId and cancel reader', async () => {
  for (const abort of [false, true]) {
    let cancelled = 0; const controller = new AbortController();
    const sdk = client(() => new Response(new ReadableStream({ cancel() { cancelled++; } }), { headers: { 'Content-Type': 'application/json', 'X-Request-ID': REQUEST_ID } }));
    const pending = sdk.getNote(ID, { signal: controller.signal, timeoutMs: 15 });
    if (abort) setTimeout(() => controller.abort('LEAK'), 5);
    await assert.rejects(pending, expectError(abort ? 'aborted' : 'timeout', 'getNote', { status: 200, requestId: REQUEST_ID }));
    assert.equal(cancelled, 1);
  }
});

test('body stream network failure retains status and safe ID', async () => {
  const sdk = client(() => new Response(new ReadableStream({ start(controller) { controller.error(new Error('LEAK')); } }), { status: 503, headers: { 'X-Request-ID': REQUEST_ID } }));
  await assert.rejects(sdk.getNote(ID), expectError('network', 'getNote', { status: 503, requestId: REQUEST_ID }));
});

test('caller cancellation takes priority at a deadline checkpoint and sanitized reason stays private', async t => {
  // Keep validation and the initial checkpoint before the deadline, independent
  // of CI scheduling. The token hook establishes both conditions before the
  // next checkpoint instead of hoping a real 1ms window remains open.
  let now = 0;
  t.mock.method(Date, 'now', () => now);
  const controller = new AbortController();
  let tokenCalls = 0; let fetches = 0;
  const sdk = client(() => { fetches++; return response(NOTE); }, {
    getAccessToken: () => {
      tokenCalls++;
      now = 1;
      controller.abort(new Error('LEAK raw-secret'));
      return TOKEN;
    },
  });
  await assert.rejects(sdk.getNote(ID, { timeoutMs: 1, signal: controller.signal }), expectError('aborted', 'getNote'));
  assert.equal(tokenCalls, 1);
  assert.equal(now, 1);
  assert.equal(fetches, 0);
});

test('deadline reached before the token hook is timeout when the caller has not cancelled', async t => {
  // Reproduce the scheduling case that made the previous wall-clock priority
  // test flaky: time advances after operation start but before token acquisition.
  let reads = 0;
  t.mock.method(Date, 'now', () => reads++ === 0 ? 0 : 1);
  const controller = new AbortController();
  let tokenCalls = 0; let fetches = 0;
  const sdk = client(() => { fetches++; return response(NOTE); }, {
    getAccessToken: () => { tokenCalls++; controller.abort(); return TOKEN; },
  });
  await assert.rejects(sdk.getNote(ID, { timeoutMs: 1, signal: controller.signal }), expectError('timeout', 'getNote'));
  assert.equal(controller.signal.aborted, false);
  assert.equal(tokenCalls, 0);
  assert.equal(fetches, 0);
});

test('locked and status-zero responses are classified safely', async () => {
  const locked = response(NOTE); const reader = locked.body.getReader();
  await assert.rejects(client(() => locked).getNote(ID), expectError('network', 'getNote', { status: 200 }));
  reader.releaseLock();
  await assert.rejects(client(() => Response.error()).getNote(ID), expectError('network', 'getNote', { status: null }));
});

test('successful and failing oversized streams cancel at actual-byte bound without consuming remainder', async () => {
  for (const status of [200, 503]) {
    let pulls = 0; let cancelled = 0;
    const stream = new ReadableStream({ pull(controller) { pulls++; controller.enqueue(new Uint8Array(262_144)); }, cancel() { cancelled++; } }, { highWaterMark: 0 });
    const sdk = client(() => new Response(stream, { status, headers: { 'Content-Type': 'application/json', 'Content-Length': '1' } }));
    await assert.rejects(sdk.getNote(ID), expectError(status === 200 ? 'invalid_response' : 'http', 'getNote', { status, errorCode: null }));
    assert.equal(pulls, 5); assert.equal(cancelled, 1);
  }
});

test('unknown extra output cannot bypass body byte bound', async () => {
  const sdk = client(() => response({ ...NOTE, unknown: 'x'.repeat(1024 * 1024) }));
  await assert.rejects(sdk.getNote(ID), expectError('invalid_response', 'getNote'));
});

test('empty stream chunks do not affect a later valid JSON response or deadline handling', async () => {
  let reads = 0;
  const bytes = new TextEncoder().encode(JSON.stringify(NOTE));
  const stream = new ReadableStream({
    pull(controller) {
      if (++reads <= 4096) controller.enqueue(new Uint8Array(0));
      else { controller.enqueue(bytes); controller.close(); }
    },
  }, { highWaterMark: 0 });
  const sdk = client(() => new Response(stream, { headers: { 'Content-Type': 'application/json' } }));
  assert.deepEqual(await sdk.getNote(ID), NOTE);
  assert.equal(reads, 4097);

  let cancelled = 0;
  const endless = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(0)); }, cancel() { cancelled++; } }, { highWaterMark: 0 });
  await assert.rejects(client(() => new Response(endless, { headers: { 'Content-Type': 'application/json' } })).getNote(ID, { timeoutMs: 10 }), expectError('timeout', 'getNote', { status: 200 }));
  assert.equal(cancelled, 1);
});

test('broken Response subclass getters do not expose raw exceptions', async () => {
  class BrokenHeaders extends Response { get headers() { throw new Error('LEAK raw-secret'); } }
  class BrokenBody extends Response { get body() { throw new Error('LEAK raw-secret'); } }
  for (const ResponseType of [BrokenHeaders, BrokenBody]) {
    await assert.rejects(client(() => new ResponseType(JSON.stringify(NOTE))).getNote(ID), expectError('network', 'getNote', { status: 200 }));
  }
});

test('maximum escaped legal content fits response limit and preserves original text', async () => {
  const escaped = '\u0001';
  const sources = Array.from({ length: 20 }, () => ({ title: escaped.repeat(300), url: `https://example.com/${escaped.repeat(2028)}`, excerpt: escaped.repeat(1000) }));
  const note = { ...NOTE, title: escaped.repeat(200), body: escaped.repeat(20000), sources };
  assert.ok(new TextEncoder().encode(JSON.stringify(note)).byteLength < 1024 * 1024);
  assert.deepEqual(await client(() => response(note)).getNote(ID), note);
});

test('operation completion removes external listeners and timer does not abort successful signal later', async () => {
  const controller = new AbortController(); let adds = 0; let removes = 0; let internal;
  const add = controller.signal.addEventListener.bind(controller.signal);
  const remove = controller.signal.removeEventListener.bind(controller.signal);
  controller.signal.addEventListener = (...args) => { adds++; return add(...args); };
  controller.signal.removeEventListener = (...args) => { removes++; return remove(...args); };
  const sdk = client((_, init) => { internal = init.signal; return response(NOTE); });
  await sdk.getNote(ID, { signal: controller.signal, timeoutMs: 10 });
  assert.equal(adds, removes);
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(internal.aborted, false);
});
