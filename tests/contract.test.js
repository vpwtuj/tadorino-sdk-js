import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { TadorinoClient } from '../dist/index.js';

const bytes = await readFile(new URL('./fixtures/notes.openapi.json', import.meta.url), 'utf8');
const contract = JSON.parse(bytes);
const provenance = JSON.parse(await readFile(new URL('./fixtures/upstream.json', import.meta.url), 'utf8'));
const id = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
const operationId = '22222222-2222-4222-8222-222222222222';
const at = '2026-10-14T00:00:00.000Z';
const input = { title: '合成の確認', body: '## 原文\n日本語 ＡＢＣ 🐈\n',
  sources: [{ title: '資料', url: 'https://example.com/source', excerpt: ' 原文の引用\n' }],
  idempotency_key: operationId };
const summary = { note_id: id, title: input.title, created_at: at };
const metadata = { state: 'active', revision: 2, content_version: 2, updated_at: at, state_changed_at: at };
const trashMetadata = { ...metadata, state: 'trashed', trashed_at: at, restore_state: 'archived' };
const note = { ...summary, body: input.body, sources: input.sources, ...metadata };
const mutation = { note_id: id, expected_revision: 2, idempotency_key: operationId };
const receipt = { note_id: id, ...metadata, changed: true, replayed: false };
const item = { ...summary, snippet: input.body, ...metadata };
const historyItem = { content_version: 2, recorded_at: at, source: 'restore', restored_from_version: 1 };
const version = { ...historyItem, note_id: id, title: input.title, body: input.body, sources: input.sources };
const history = { note_id: id, current_revision: 2, current_content_version: 2, items: [historyItem], has_more: false, next_cursor: null };
const prepared = { import_id: operationId, status: 'awaiting_upload', expires_at: at };
const imported = { import_id: operationId, status: 'committed', imported_at: at, imported_notes: 1, imported_versions: 2,
  mappings: [{ source_note_id: id, note_id: operationId, content_version: 2 }], replayed: false };
const pendingPurge = { purge_id: operationId, note_id: id, status: 'pending', requested_at: at };
const completedPurge = { ...pendingPurge, status: 'completed', completed_at: at };

// Independent fixture validation exercises structural JSON Schema constructs used
// by the server-generated contract. This is not derived from SDK validators.
function check(value, schema) {
  if (schema.$ref) check(value, contract.components.schemas[schema.$ref.split('/').at(-1)]);
  for (const child of schema.allOf ?? []) check(value, child);
  if (schema.anyOf || schema.oneOf) {
    const passing = (schema.anyOf ?? schema.oneOf).filter(child => { try { check(value, child); return true; } catch { return false; } });
    assert.ok(schema.oneOf ? passing.length === 1 : passing.length > 0, 'union member');
  }
  if (Array.isArray(schema.type)) {
    assert.ok(schema.type.some(type => { try { check(value, { ...schema, type }); return true; } catch { return false; } }));
    return;
  }
  if (schema.type === 'object') {
    assert.ok(value && typeof value === 'object' && !Array.isArray(value));
    for (const key of schema.required ?? []) assert.ok(Object.hasOwn(value, key), `required: ${key}`);
    if (schema.additionalProperties === false) for (const key of Object.keys(value)) assert.ok(Object.hasOwn(schema.properties, key), `unexpected: ${key}`);
    if (schema.minProperties) assert.ok(Object.keys(value).length >= schema.minProperties);
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(schema.properties ?? {})) if (Object.hasOwn(value, key)) check(value[key], child);
  }
  if (schema.type === 'array') {
    assert.ok(Array.isArray(value));
    if (schema.minItems !== undefined) assert.ok(value.length >= schema.minItems);
    if (schema.maxItems !== undefined) assert.ok(value.length <= schema.maxItems);
    value.forEach(item => check(item, schema.items));
  } else if (schema.type === 'string') {
    assert.equal(typeof value, 'string');
    if (schema.minLength !== undefined) assert.ok([...value].length >= schema.minLength);
    if (schema.maxLength !== undefined) assert.ok([...value].length <= schema.maxLength);
    if (schema.pattern) assert.match(value, new RegExp(schema.pattern, 'u'));
    if (schema.format === 'uuid') assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    if (schema.format === 'date-time') assert.ok(Number.isFinite(Date.parse(value)));
  } else if (schema.type === 'integer') {
    assert.ok(Number.isInteger(value));
    if (schema.minimum !== undefined) assert.ok(value >= schema.minimum);
    if (schema.exclusiveMinimum !== undefined) assert.ok(value > schema.exclusiveMinimum);
    if (schema.maximum !== undefined) assert.ok(value <= schema.maximum);
  } else if (schema.type === 'null') assert.equal(value, null);
  else if (schema.type && schema.type !== 'object') assert.equal(typeof value, schema.type);
  if (schema.enum) assert.ok(schema.enum.includes(value));
  if (Object.hasOwn(schema, 'const')) assert.equal(value, schema.const);
}

const cases = [
  ['createNote', '/v1/notes', 'post', input, { ...summary, created: true }, 201, 'write'],
  ['searchNotes', '/v1/notes/search', 'post', { query: '日本語', limit: 1, state: 'active' }, { items: [item], has_more: false, next_cursor: null }, 200, 'read'],
  ['listNotes', '/v1/notes/list', 'post', { state: 'archived', cursor: 'opaque', limit: 10 }, { items: [item], has_more: false, next_cursor: null }, 200, 'read'],
  ['getNote', '/v1/notes/{note_id}', 'get', id, note, 200, 'read'],
  ['getTrashedNote', '/v1/notes/{note_id}/trash', 'get', id, { ...note, ...trashMetadata }, 200, 'read'],
  ['updateNote', '/v1/notes/{note_id}', 'patch', { ...mutation, body: input.body, sources: [] }, receipt, 200, 'update'],
  ...['archive', 'unarchive', 'trash', 'restore'].map(action => [`${action}Note`, `/v1/notes/{note_id}/${action}`, 'post', mutation,
    action === 'trash' ? { ...receipt, ...trashMetadata } : receipt, 200, 'organize']),
  ['listNoteVersions', '/v1/notes/{note_id}/versions/list', 'post', { note_id: id, limit: 10 }, history, 200, 'read'],
  ['listTrashedNoteVersions', '/v1/notes/{note_id}/trash/versions/list', 'post', { note_id: id }, history, 200, 'read'],
  ['getNoteVersion', '/v1/notes/{note_id}/versions/{version}', 'get', { note_id: id, version: 2 }, version, 200, 'read'],
  ['getTrashedNoteVersion', '/v1/notes/{note_id}/trash/versions/{version}', 'get', { note_id: id, version: 2 }, version, 200, 'read'],
  ['restoreNoteVersion', '/v1/notes/{note_id}/versions/{version}/restore', 'post', { ...mutation, version: 1 }, receipt, 200, 'update'],
  ['getNoteImport', '/v1/note-imports/{import_id}', 'get', operationId, imported, 200, 'import'],
  ['cancelNoteImport', '/v1/note-imports/{import_id}/cancel', 'post', operationId, { ...prepared, status: 'cancelled' }, 200, 'import'],
  ['purgeNote', '/v1/notes/{note_id}/purge', 'post', mutation, pendingPurge, 202, 'purge'],
  ['purgeNote', '/v1/notes/{note_id}/purge', 'post', mutation, completedPurge, 200, 'purge'],
  ['getNotePurge', '/v1/note-purges/{purge_id}', 'get', operationId, pendingPurge, 202, 'purge'],
  ['getNotePurge', '/v1/note-purges/{purge_id}', 'get', operationId, completedPurge, 200, 'purge'],
];

test('fixture provenance matches exact upstream bytes and every public JSON method has a fixture case', () => {
  assert.equal(provenance.repository, 'vpwtuj/tadorino');
  assert.equal(provenance.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(contract.openapi, '3.1.0');
  assert.equal(contract['x-resource-audience-setting'], 'MCP_RESOURCE_URL');
  const covered = new Set([...cases.map(row => row[0]), 'exportNotes', 'prepareNoteImport', 'uploadNoteImport', 'prepareNoteExport']);
  for (const route of Object.values(contract.paths)) for (const operation of Object.values(route)) assert.ok(covered.has(operation.operationId), operation.operationId);
});

for (const [name, route, method, argument, output, status, scope] of cases) {
  test(`${name} HTTP ${status} matches the independent upstream-generated contract`, async () => {
    const operation = contract.paths[route][method];
    assert.equal(operation.operationId, name);
    assert.deepEqual(operation['x-required-scopes'], [`notes:${scope}`]);
    let requests = 0;
    const client = new TadorinoClient({ baseUrl: 'https://example.com', getAccessToken: () => 'synthetic-token',
      fetch: async (url, options) => {
        requests++;
        assert.equal(String(url), `https://example.com${route.replace('{note_id}', id).replace('{version}', argument.version ?? 2).replace('{import_id}', operationId).replace('{purge_id}', operationId)}`);
        assert.equal(options.method.toLowerCase(), method);
        const headers = new Headers(options.headers);
        assert.equal(headers.get('authorization'), 'Bearer synthetic-token');
        assert.equal(headers.get('accept'), 'application/json');
        assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
        if (method !== 'get') {
          assert.equal(headers.get('content-type'), 'application/json');
          const submitted = JSON.parse(options.body);
          const expected = typeof argument === 'string' ? {} : Object.fromEntries(Object.entries(argument).filter(([key]) => !['note_id', 'version'].includes(key)));
          assert.deepEqual(submitted, expected);
          check(submitted, operation.requestBody.content['application/json'].schema);
        } else assert.equal(options.body, undefined);
        check(output, operation.responses[String(status)].content['application/json'].schema);
        const reply = structuredClone(output); reply.future_field = 'drop this';
        if (reply.sources) reply.sources.forEach(source => { source.future_field = 'drop this too'; });
        if (reply.items) reply.items.forEach(item => { item.future_field = 'drop this too'; });
        return Response.json(reply, { status });
      } });
    const actual = await client[name](argument);
    assert.deepEqual(actual, output);
    check(actual, operation.responses[String(status)].content['application/json'].schema);
    assert.equal(requests, 1);
  });
}

test('export matches binary media contract and import matches separate JSON preparation and binary upload', async () => {
  const exportOperation = contract.paths['/v1/notes/export'].post;
  assert.equal(exportOperation.operationId, 'exportNotes');
  assert.deepEqual(exportOperation['x-required-scopes'], ['notes:export']);
  assert.ok(exportOperation.responses['200'].content['application/zip']);
  const archive = new Uint8Array([80,75,3,4]); let requests = 0;
  const client = new TadorinoClient({ baseUrl:'https://example.com', getAccessToken:()=> 'synthetic', fetch:async(url,init)=>{
    requests++;
    if(url.endsWith('/export')) { assert.equal(new Headers(init.headers).get('Accept'),'application/zip'); check(JSON.parse(init.body),exportOperation.requestBody.content['application/json'].schema); return new Response(archive,{headers:{'Content-Type':'application/zip'}}); }
    if(init.method==='POST') { const operation = contract.paths['/v1/note-imports'].post;assert.equal(operation.operationId,'prepareNoteImport');assert.deepEqual(operation['x-required-scopes'],['notes:import']);check(JSON.parse(init.body),operation.requestBody.content['application/json'].schema);check(prepared,operation.responses['201'].content['application/json'].schema);return Response.json(prepared,{status:201}); }
    const operation = contract.paths['/v1/note-imports/{import_id}/archive'].put; assert.equal(operation.operationId,'uploadNoteImport');assert.deepEqual(operation['x-required-scopes'],['notes:import']);assert.ok(operation.requestBody.content['application/zip']);assert.equal(url,`https://example.com/v1/note-imports/${operationId}/archive`);assert.equal(new Headers(init.headers).get('Content-Type'),'application/zip');assert.deepEqual(new Uint8Array(await new Response(init.body).arrayBuffer()),archive);check(imported,operation.responses['200'].content['application/json'].schema);return Response.json(imported);
  }});
  const exported=await client.exportNotes({include_history:true});assert.deepEqual(new Uint8Array(await new Response(exported.stream).arrayBuffer()),archive);
  assert.deepEqual(await client.importNotes({archive,idempotency_key:operationId,source_note_ids:[id]}),imported);assert.equal(requests,3);
});
