import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startFixture } from './fixture-server.mjs';

// Synthetic-only browser fixture. No Auth0 account, JWT verification or DB is
// tested here. The machine credential and token never enter the browser.
const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(path.join(os.tmpdir(), 'tadorino-m2m-browser-'));
const run = promisify(execFile);
let vite; let fixture; let backend; let closing = false;
const cleanup = async () => {
  if (closing) return; closing = true;
  vite?.kill('SIGTERM');
  if (backend) await new Promise(resolve => { backend.closeAllConnections(); backend.close(resolve); });
  await fixture?.close(); await rm(temporary, { recursive: true, force: true });
};
try {
  const { stdout } = await run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', temporary], { cwd: root });
  const tarball = path.join(temporary, JSON.parse(stdout)[0].filename);
  const example = path.join(temporary, 'm2m');
  await cp(path.join(root, 'examples/m2m'), example, { recursive: true, filter: source => !/(?:^|\/)(?:node_modules|dist|\.env(?:\..*)?|tsconfig\.tsbuildinfo)(?:\/|$)/.test(source) || source.endsWith('.env.example') });
  const manifest = JSON.parse(await readFile(path.join(example, 'package.json'), 'utf8'));
  manifest.dependencies['@bright203/tadorino-sdk-js'] = `file:${tarball}`;
  await writeFile(path.join(example, 'package.json'), JSON.stringify(manifest));
  await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: example });
  const { createApp } = await import(pathToFileURL(path.join(example, 'app.js')));
  const { createTokenProvider } = await import(pathToFileURL(path.join(example, 'token-provider.js')));
  const getAccessToken = createTokenProvider({ issuer: 'https://synthetic.example.com/', clientId: 'synthetic-client', clientSecret: 'synthetic-server-only-secret', audience: 'synthetic-audience' }, {
    fetch: async () => Response.json({ access_token: 'synthetic-machine-token', token_type: 'Bearer', expires_in: 3600 }),
  });
  fixture = await startFixture({ port: 4011, origins: [] });
  backend = createApp({ baseUrl: fixture.baseUrl, getAccessToken }).listen(5181, '127.0.0.1');
  await new Promise((resolve, reject) => { backend.once('listening', resolve); backend.once('error', reject); });
  vite = spawn(process.execPath, [path.join(example, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5174', '--strictPort'], { cwd: example, env: { ...process.env }, stdio: 'inherit' });
  console.log('Synthetic-only local M2M fixture: browser → Express → packed SDK → in-memory memo fixture.');
  vite.once('exit', async code => { await cleanup(); process.exit(code ?? 1); });
  for (const event of ['SIGINT', 'SIGTERM']) process.on(event, () => { void cleanup().then(() => process.exit(0)); });
} catch (error) { await cleanup(); throw error; }
