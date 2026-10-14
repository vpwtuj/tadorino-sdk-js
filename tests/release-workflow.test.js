import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
const documentationJob = workflow.split('  documentation-build:\n')[1].split('  documentation:\n')[0];
const inline = /node --input-type=module <<'JS'\n([\s\S]*?)\n\s+JS\n/.exec(documentationJob)?.[1];
assert(inline, 'Availability polling must remain inline for older immutable tags.');
const source = inline.split('\n').map(line => line.replace(/^ {10}/, '')).join('\n');
const functionSource = source.slice(source.indexOf('async function waitForPublishedVersion'), source.indexOf('\nconst manifest'));
// Execute the actual workflow helper with controlled public HTTP responses and a
// virtual clock, rather than duplicating its polling algorithm in the test.
const wait = Function(`${functionSource}; return waitForPublishedVersion;`)();
const name = '@bright203/tadorino-sdk-js';
const version = '0.1.0';
const ready = () => Response.json({ name, version });
function virtualClock(overrides = {}) {
  let now = 0;
  const sleeps = [];
  const logs = [];
  return { sleeps, logs, options: { name, version, now: () => now,
    sleep: async ms => { now += ms; sleeps.push(ms); }, log: value => logs.push(value), ...overrides } };
}

test('publish-time scanning and transient registry errors are read again until the exact version is ready', async () => {
  const clock = virtualClock();
  const statuses = [404, 429, 503, 200];
  let calls = 0;
  await wait({ ...clock.options, fetch: async (url, init) => {
    assert.equal(new URL(url).origin, 'https://registry.npmjs.org');
    assert.equal(decodeURIComponent(new URL(url).pathname), `/${name}/${version}`);
    assert.equal(init.method ?? 'GET', 'GET');
    assert.equal(init.body, undefined);
    assert.equal(init.credentials, 'omit');
    assert.equal(init.redirect, 'manual');
    assert.equal(init.headers.Authorization, undefined);
    assert.equal(init.headers.Cookie, undefined);
    assert(init.signal instanceof AbortSignal);
    const status = statuses[calls++];
    return status === 200 ? ready() : new Response(null, { status });
  } });
  assert.equal(calls, 4);
  assert.deepEqual(clock.sleeps, [30_000, 30_000, 30_000]);
});

test('a version that stays pending stops at the overall deadline without another upload', async () => {
  const clock = virtualClock({ timeoutMs: 65, intervalMs: 30, requestTimeoutMs: 10 });
  let calls = 0;
  await assert.rejects(wait({ ...clock.options, fetch: async () => {
    calls++; return new Response(null, { status: 404 });
  } }), /bounded registry wait/);
  assert.equal(calls, 3);
  assert.deepEqual(clock.sleeps, [30, 30, 5]);
});

test('terminal HTTP errors, malformed JSON and wrong release metadata fail without retries', async () => {
  const cases = [
    [() => new Response(null, { status: 403 }), /HTTP 403/],
    [() => new Response('{broken', { headers: { 'Content-Type': 'application/json' } }), /malformed package metadata/],
    [() => Response.json({ name, version: '0.2.0' }), /name or version/],
    [() => Response.json({ name: '@another/package', version }), /name or version/],
  ];
  for (const [response, expected] of cases) {
    const clock = virtualClock();
    let calls = 0;
    await assert.rejects(wait({ ...clock.options, fetch: async () => { calls++; return response(); } }), expected);
    assert.equal(calls, 1);
    assert.deepEqual(clock.sleeps, []);
  }
});

test('the request deadline interrupts a stalled body and keeps original errors out of logs', { timeout: 10_000 }, async () => {
  const clock = virtualClock({ requestTimeoutMs: 5 });
  let aborted = false;
  let calls = 0;
  await wait({ ...clock.options, fetch: async (url, init) => {
    void url;
    if (++calls > 1) return ready();
    return new Response(new ReadableStream({ start(controller) {
      init.signal.addEventListener('abort', () => {
        aborted = true;
        controller.error(new DOMException('synthetic private transport detail', 'AbortError'));
      }, { once: true });
    } }), { headers: { 'Content-Type': 'application/json' } });
  } });
  assert(aborted);
  assert.equal(calls, 2);
  assert.deepEqual(clock.sleeps, [30_000]);
  assert(!clock.logs.join('\n').includes('private transport detail'));
});

test('documentation polling works after old-tag checkout and before preparing Pages', () => {
  const marker = documentationJob.indexOf('Wait for the exact published version to become publicly readable');
  assert(marker > documentationJob.indexOf('uses: actions/setup-node@v7'));
  assert(marker < documentationJob.indexOf('run: node scripts/prepare-pages.mjs'));
  const imports = [...source.matchAll(/^import .* from '([^']+)'/gm)].map(match => match[1]);
  assert(imports.length > 0);
  assert(imports.every(module => module.startsWith('node:')));
  assert(source.includes("readFile('package.json', 'utf8')"));
  assert(!source.includes('npm publish'));
});
