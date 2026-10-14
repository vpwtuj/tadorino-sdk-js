import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const run = (command, args, cwd = root) => {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`Documentation step failed: ${command}`);
};
const published = version => {
  const result = spawnSync('npm', ['view', `${manifest.name}@${version}`, 'version', '--json'], { encoding: 'utf8' });
  let value;
  try { value = JSON.parse(result.stdout); } catch { throw new Error('Could not verify npm release version.'); }
  if (result.status !== 0) {
    if (value?.error?.code === 'E404') return false;
    throw new Error('Could not verify npm release version; previous documentation must not be discarded on a registry outage.');
  }
  return value === version;
};
if (!/^\d+\.\d+\.\d+$/.test(manifest.version) || !published(manifest.version)) {
  throw new Error('Publish this exact stable npm version before publishing its release documentation.');
}
const output = join(root, 'pages');
const verifySite = async (directory, version) => {
  const site = JSON.parse(await readFile(join(directory, 'site/version.json'), 'utf8'));
  const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  if (pkg.name !== manifest.name || pkg.version !== version || site.package !== pkg.name || site.version !== version) {
    throw new Error('Tag, package and generated documentation versions must match.');
  }
};
await verifySite(root, manifest.version);
await rm(output, { recursive: true, force: true });
await mkdir(output);
await cp(join(root, 'site'), join(output, `v${manifest.version}`), { recursive: true });
const versions = [manifest.version];
const tags = execFileSync('git', ['tag', '--list', 'v*', '--sort=-version:refname'], { cwd: root, encoding: 'utf8' }).trim().split('\n');
// Rebuild previously published stable tags instead of erasing their docs at
// every Pages deployment. Each tag retains its own source and dependency lock.
for (const tag of tags) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag) || tag === `v${manifest.version}` || !published(tag.slice(1))) continue;
  const temporary = await mkdtemp(join(tmpdir(), 'tadorino-documentation-'));
  const checkout = join(temporary, 'sdk');
  try {
    run('git', ['worktree', 'add', '--detach', checkout, tag]);
    const tagged = JSON.parse(await readFile(join(checkout, 'package.json'), 'utf8'));
    if (tagged.name !== manifest.name || tagged.version !== tag.slice(1)) throw new Error('Historical release tag does not match its package.');
    run('npm', ['ci'], checkout);
    run('npm', ['run', 'docs:build'], checkout);
    await verifySite(checkout, tag.slice(1));
    await cp(join(checkout, 'site'), join(output, tag), { recursive: true });
    versions.push(tag.slice(1));
  } finally {
    spawnSync('git', ['worktree', 'remove', '--force', checkout], { cwd: root, stdio: 'ignore' });
    await rm(temporary, { recursive: true, force: true });
  }
}
versions.sort((left, right) => {
  const a = left.split('.').map(Number); const b = right.split('.').map(Number);
  return b[0] - a[0] || b[1] - a[1] || b[2] - a[2];
});
await cp(join(output, `v${versions[0]}`), join(output, 'latest'), { recursive: true });
const links = versions.map(version => `<li><a href="./v${version}/">${version}</a></li>`).join('');
await writeFile(join(output, 'index.html'), `<!doctype html><html lang="ja"><meta charset="utf-8"><title>Tadorino JavaScript SDK</title><h1>Tadorino JavaScript SDK</h1><p><a href="./latest/">最新安定版 ${versions[0]}</a></p><h2>バージョン別ドキュメント</h2><ul>${links}</ul></html>\n`);
await writeFile(join(output, '.nojekyll'), '');
console.log(`Prepared documentation matching published ${manifest.name}@${manifest.version}; ${versions.length} stable versions retained.`);
