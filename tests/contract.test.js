import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { TadorinoClient } from '../dist/index.js';

const bytes = await readFile(new URL('./fixtures/notes.openapi.json', import.meta.url), 'utf8');
const contract = JSON.parse(bytes);
const provenance = JSON.parse(await readFile(new URL('./fixtures/upstream.json', import.meta.url), 'utf8'));
const id = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
const input = { title: '合成の確認', body: '## 原文\n日本語 ＡＢＣ 🐈\n',
  sources: [{ title: '資料', url: 'https://example.com/source', excerpt: ' 原文の引用\n' }],
  idempotency_key: '11111111-2222-3333-8444-555555555555' };
const summary = { note_id: id, title: input.title, created_at: '2026-10-14T00:00:00.000Z' };

function check(value, schema) {
  if (schema.$ref) return check(value, contract.components.schemas[schema.$ref.split('/').at(-1)]);
  if (schema.type === 'object') {
    assert.ok(value && typeof value === 'object' && !Array.isArray(value));
    for (const key of schema.required ?? []) assert.ok(Object.hasOwn(value, key), `required: ${key}`);
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) assert.ok(Object.hasOwn(schema.properties, key), `unexpected: ${key}`);
    }
    if (schema.minProperties) assert.ok(Object.keys(value).length >= schema.minProperties);
    for (const [key, child] of Object.entries(schema.properties ?? {})) if (Object.hasOwn(value, key)) check(value[key], child);
  } else if (schema.type === 'array') {
    assert.ok(Array.isArray(value));
    if (schema.maxItems !== undefined) assert.ok(value.length <= schema.maxItems);
    value.forEach(item => check(item, schema.items));
  } else if (schema.type === 'string') {
    assert.equal(typeof value, 'string');
    if (schema.minLength !== undefined) assert.ok([...value].length >= schema.minLength);
    if (schema.maxLength !== undefined) assert.ok([...value].length <= schema.maxLength);
    if (schema.pattern) assert.match(value, new RegExp(schema.pattern, 'u'));
  } else if (schema.type === 'integer') {
    assert.ok(Number.isInteger(value));
    if (schema.minimum !== undefined) assert.ok(value >= schema.minimum);
    if (schema.maximum !== undefined) assert.ok(value <= schema.maximum);
  } else if (schema.type) assert.equal(typeof value, schema.type);
  if (schema.enum) assert.ok(schema.enum.includes(value));
  if (Object.hasOwn(schema, 'const')) assert.equal(value, schema.const);
}

test('fixture provenance is public and matches its exact upstream contract bytes', () => {
  assert.equal(provenance.repository, 'vpwtuj/tadorino');
  assert.equal(provenance.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(contract.openapi, '3.1.0');
  assert.equal(contract['x-resource-audience-setting'], 'MCP_RESOURCE_URL');
});

for (const [name, route, method, argument, output, status] of [
  ['createNote', '/v1/notes', 'post', input, { ...summary, created: true }, 201],
  ['searchNotes', '/v1/notes/search', 'post', { query: '日本語', limit: 1 },
    { items: [{ ...summary, snippet: input.body }], has_more: false }, 200],
  ['getNote', '/v1/notes/{note_id}', 'get', id,
    { ...summary, body: input.body, sources: input.sources }, 200],
]) {
  test(`${name} packed runtime matches the independent published HTTP contract`, async () => {
    const operation = contract.paths[route][method];
    assert.equal(operation.operationId, name);
    assert.deepEqual(operation['x-required-scopes'], [name === 'createNote' ? 'notes:write' : 'notes:read']);
    let requests = 0;
    const client = new TadorinoClient({ baseUrl: 'https://example.com', getAccessToken: () => 'synthetic-token',
      fetch: async (url, options) => {
        requests++;
        assert.equal(String(url), `https://example.com${route.replace('{note_id}', id)}`);
        assert.equal(options.method.toLowerCase(), method);
        const headers = new Headers(options.headers);
        assert.equal(headers.get('authorization'), 'Bearer synthetic-token');
        assert.equal(headers.get('accept'), 'application/json');
        assert.equal(options.credentials, 'omit');
        assert.equal(options.redirect, 'error');
        assert.equal(options.cache, 'no-store');
        if (method === 'post') {
          assert.equal(headers.get('content-type'), 'application/json');
          const submitted = JSON.parse(options.body);
          assert.deepEqual(submitted, argument);
          check(submitted, operation.requestBody.content['application/json'].schema);
        } else assert.equal(options.body, undefined);
        const reply = structuredClone(output);
        reply.future_field = 'drop this';
        if (reply.sources) reply.sources.forEach(source => { source.future_field = 'drop this too'; });
        if (reply.items) reply.items.forEach(item => { item.future_field = 'drop this too'; });
        return new Response(JSON.stringify(reply), { status, headers: { 'Content-Type': 'application/json' } });
      } });
    const actual = await client[name](argument);
    assert.deepEqual(actual, output);
    check(actual, operation.responses[String(status)].content['application/json'].schema);
    assert.equal(requests, 1);
  });
}
