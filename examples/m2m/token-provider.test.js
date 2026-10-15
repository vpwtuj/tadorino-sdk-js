import test from 'node:test';
import assert from 'node:assert/strict';
import { createTokenProvider, TokenProviderError } from './token-provider.js';

const config = { issuer: 'https://tenant.example.com/', clientId: 'synthetic-client', clientSecret: 'synthetic-secret', audience: 'https://notes.example.com/mcp' };
const response = (token = 'synthetic-machine-token', expires = 100) => Response.json({ access_token: token, token_type: 'Bearer', expires_in: expires });
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const rejects = (promise, kind, status = null) => assert.rejects(promise, error => {
  assert(error instanceof TokenProviderError); assert.equal(error.kind, kind); assert.equal(error.status, status);
  assert(!JSON.stringify(error).includes(config.clientSecret)); assert(!error.stack.includes(config.clientSecret)); assert.equal(error.cause, undefined); return true;
});

test('fixed HTTPS endpoint, canonical scopes, conservative expiry and singleflight', async () => {
  let time = 0; const calls = [];
  const provider = createTokenProvider({ ...config, scopes: ['notes:write', 'notes:read', 'notes:write'] }, { now: () => time, fetch: async (url, init) => { calls.push({ url, init }); return response(`synthetic-${calls.length}`); } });
  assert.deepEqual(await Promise.all([provider(), provider(), provider()]), ['synthetic-1', 'synthetic-1', 'synthetic-1']);
  assert.equal(calls.length, 1); assert.equal(calls[0].url, 'https://tenant.example.com/oauth/token');
  const request = calls[0].init;
  assert.equal(request.credentials, 'omit'); assert.equal(request.redirect, 'error'); assert.equal(request.cache, 'no-store');
  assert.deepEqual(JSON.parse(request.body), { grant_type: 'client_credentials', client_id: config.clientId, client_secret: config.clientSecret, audience: config.audience, scope: 'notes:read notes:write' });
  time = 89_999; assert.equal(await provider(), 'synthetic-1');
  time = 90_000; assert.equal(await provider(), 'synthetic-2'); assert.equal(calls.length, 2);
});

test('separate configurations and helper instances never share cached credentials', async () => {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, ...JSON.parse(init.body) }); return response(`synthetic-${calls.length}`); };
  const providers = [config, { ...config, issuer: 'https://other.example.com/' }, { ...config, clientId: 'other-client' }, { ...config, audience: 'other-audience' }, { ...config, scopes: ['notes:read'] }].map(value => createTokenProvider(value, { fetch }));
  assert.deepEqual(await Promise.all(providers.map(provider => provider())), ['synthetic-1', 'synthetic-2', 'synthetic-3', 'synthetic-4', 'synthetic-5']);
  await Promise.all(providers.map(provider => provider())); assert.equal(calls.length, 5);
});

test('token lifetime includes acquisition delay rather than beginning after the response', async () => {
  let time = 0;
  const provider = createTokenProvider(config, { now: () => time, fetch: async () => { time = 91_000; return response(); } });
  await rejects(provider(), 'invalid_response');
});

test('one caller cancellation does not abort a shared acquisition or another caller', async () => {
  const gate = deferred(); let requests = 0; let upstreamSignal;
  const provider = createTokenProvider(config, { fetch: async (url, init) => { void url; requests++; upstreamSignal = init.signal; return gate.promise; } });
  const controller = new AbortController(); const first = provider({ signal: controller.signal }); const second = provider();
  controller.abort(); await rejects(first, 'aborted'); assert.equal(upstreamSignal.aborted, false);
  gate.resolve(response()); assert.equal(await second, 'synthetic-machine-token'); assert.equal(await provider(), 'synthetic-machine-token'); assert.equal(requests, 1);
});

test('already aborted callers do not mint and all cancelled waiters tolerate a late failure', async () => {
  const gate = deferred(); let requests = 0;
  const provider = createTokenProvider(config, { fetch: async () => { requests++; return gate.promise; } });
  const controller = new AbortController(); controller.abort(); await rejects(provider({ signal: controller.signal }), 'aborted'); assert.equal(requests, 0);
  const next = new AbortController(); const waiting = provider({ signal: next.signal }); next.abort(); await rejects(waiting, 'aborted');
  gate.reject(new Error('synthetic secret from upstream must not escape'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests, 1);
});

test('HTTP and network failures are safe, not cached, and never automatically retried', async () => {
  for (const status of [400, 401, 429, 500, 503]) {
    let calls = 0; const provider = createTokenProvider(config, { fetch: async () => { calls++; return new Response('synthetic-secret', { status }); } });
    const error = await provider().catch(error => error); assert.equal(error.kind, 'http'); assert.equal(error.status, status); assert.equal(error.retryable, status === 429 || status >= 500); assert.equal(calls, 1);
    await rejects(provider(), 'http', status); assert.equal(calls, 2);
  }
  let calls = 0; const provider = createTokenProvider(config, { fetch: async () => { calls++; throw new Error(config.clientSecret); } });
  await rejects(provider(), 'network'); await rejects(provider(), 'network'); assert.equal(calls, 2);
});

test('malformed token responses fail closed without caching or echoing OAuth data', async () => {
  const bad = [null, [], { access_token: 'Bearer secret with spaces', token_type: 'Bearer', expires_in: 100 }, { access_token: 'synthetic\n', token_type: 'Bearer', expires_in: 100 }, { access_token: 'synthetic', token_type: 'Bearer\n', expires_in: 100 }, { access_token: 'synthetic', token_type: 'MAC', expires_in: 100 }, { access_token: 'synthetic', token_type: 'Bearer', expires_in: 0 }, { access_token: 'synthetic', token_type: 'Bearer', expires_in: '100' }, { access_token: 'synthetic', token_type: 'Bearer', expires_in: 2_592_001 }];
  for (const value of bad) { const provider = createTokenProvider(config, { fetch: async () => Response.json(value) }); await rejects(provider(), 'invalid_response'); }
  for (const make of [() => new Response('{broken', { headers: { 'content-type': 'application/json' } }), () => new Response('{}', { headers: { 'content-type': 'text/html' } }), () => new Response(null, { status: 200, headers: { 'content-type': 'application/json' } })]) {
    let calls = 0; const provider = createTokenProvider(config, { fetch: async () => { calls++; return make(); } }); await rejects(provider(), 'invalid_response'); await rejects(provider(), 'invalid_response'); assert.equal(calls, 2);
  }
});

test('stream byte limit cancels the body, independent of Content-Length', async () => {
  let cancelled = false;
  const provider = createTokenProvider(config, { fetch: async () => new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(65_537)); }, cancel() { cancelled = true; } }), { headers: { 'content-type': 'application/json', 'content-length': '1' } }) });
  await rejects(provider(), 'invalid_response'); assert.equal(cancelled, true);
});

test('deadline covers headers and an uncooperative late fetch cannot populate cache', async () => {
  const gate = deferred(); let calls = 0;
  const provider = createTokenProvider({ ...config, timeoutMs: 25 }, { fetch: async () => { calls++; return calls === 1 ? gate.promise : response('synthetic-fresh'); } });
  await rejects(provider(), 'timeout'); gate.resolve(response('synthetic-late')); await new Promise(resolve => setImmediate(resolve));
  assert.equal(await provider(), 'synthetic-fresh'); assert.equal(calls, 2);
});

test('deadline covers a stalled response body and cancels it', async () => {
  let cancelled = false;
  const provider = createTokenProvider({ ...config, timeoutMs: 25 }, { fetch: async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'content-type': 'application/json' } }) });
  await rejects(provider(), 'timeout'); assert.equal(cancelled, true);
});

test('configuration rejects alternate endpoint paths, insecure transport, scopes and getters', () => {
  for (const override of [{ issuer: 'http://localhost/' }, { issuer: 'https://example.com/path' }, { issuer: 'https://user:secret@example.com/' }, { issuer: 'https://example.com/?secret=value' }, { scopes: ['admin:write'] }, { clientId: 'bad client' }, { clientSecret: '' }, { timeoutMs: 0 }, { extra: true }]) {
    assert.throws(() => createTokenProvider({ ...config, ...override }), error => error instanceof TokenProviderError && error.kind === 'configuration');
  }
  const getter = { ...config }; Object.defineProperty(getter, 'clientSecret', { get() { assert.fail('must not evaluate getters'); }, enumerable: true });
  assert.throws(() => createTokenProvider(getter), TokenProviderError);
  const inherited = Object.create({ get issuer() { assert.fail('must not evaluate inherited getters'); } });
  assert.throws(() => createTokenProvider(inherited), TokenProviderError);
});
