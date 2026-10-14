import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { startFixture } from './fixture-server.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(path.join(os.tmpdir(), 'tadorino-sdk-browser-'));
const run = promisify(execFile);
let vite;
let fixture;
let closing = false;
const cleanup = async () => {
  if (closing) return;
  closing = true;
  vite?.kill('SIGTERM');
  await fixture?.close();
  await rm(temporary, { recursive: true, force: true });
};
try {
  const { stdout } = await run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', temporary], { cwd: root });
  const tarball = path.join(temporary, JSON.parse(stdout)[0].filename);
  const example = path.join(temporary, 'vite');
  await cp(path.join(root, 'examples/vite'), example, { recursive: true, filter: source => !/(?:^|\/)(?:node_modules|dist|\.env(?:\..*)?|tsconfig\.tsbuildinfo)(?:\/|$)/.test(source) || source.endsWith('.env.example') });
  const manifest = JSON.parse(await readFile(path.join(example, 'package.json'), 'utf8'));
  manifest.dependencies['@bright203/tadorino-sdk-js'] = `file:${tarball}`;
  await writeFile(path.join(example, 'package.json'), JSON.stringify(manifest));
  await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: example });
  fixture = await startFixture({ port: 4010 });
  vite = spawn(process.execPath, [path.join(example, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
    cwd: example,
    env: { ...process.env, VITE_DEMO_MODE: 'true', VITE_FIXTURE_MODE: 'false', VITE_TADORINO_BASE_URL: fixture.baseUrl },
    stdio: 'inherit',
  });
  vite.once('exit', async code => { await cleanup(); process.exit(code ?? 1); });
  for (const event of ['SIGINT', 'SIGTERM']) process.on(event, () => { void cleanup().then(() => process.exit(0)); });
} catch (error) { await cleanup(); throw error; }
