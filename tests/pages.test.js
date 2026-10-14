import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('release documentation preserves previous versions and never labels an older release latest', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'tadorino-pages-check-'));
  const directory = join(temporary, 'repository');
  const bin = join(temporary, 'bin');
  await mkdir(join(directory, 'scripts'), { recursive: true });
  await mkdir(join(directory, 'site'));
  await mkdir(bin);
  const git = args => execFileSync('git', args, { cwd: directory, stdio: 'pipe' });
  try {
    await cp(new URL('../scripts/prepare-pages.mjs', import.meta.url), join(directory, 'scripts/prepare-pages.mjs'));
    await writeFile(join(directory, '.gitignore'), 'site/\npages/\n');
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name: '@bright203/tadorino-sdk-js', version: '0.2.0' }));
    git(['init', '-b', 'main']);
    git(['config', 'user.email', 'fixture@example.invalid']);
    git(['config', 'user.name', 'Synthetic fixture']);
    git(['add', '.']); git(['commit', '-m', 'Synthetic published version']); git(['tag', 'v0.2.0']);
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name: '@bright203/tadorino-sdk-js', version: '0.1.0' }));
    await writeFile(join(directory, 'site/index.html'), 'Synthetic documentation 0.1.0');
    await writeFile(join(directory, 'site/version.json'), JSON.stringify({ package: '@bright203/tadorino-sdk-js', version: '0.1.0' }));
    await writeFile(join(bin, 'npm'), `#!/usr/bin/env node
const fs=require('node:fs');
if(process.argv[2]==='view') {
 if(process.env.SIMULATE_REGISTRY_FAILURE) {console.log(JSON.stringify({error:{code:'ENETWORK'}}));process.exit(1);}
 const version=process.argv[3].split('@').at(-1);console.log(JSON.stringify(version));
} else if(process.argv[2]==='run') {const pkg=JSON.parse(fs.readFileSync('package.json'));fs.mkdirSync('site',{recursive:true});fs.writeFileSync('site/index.html','Synthetic documentation '+pkg.version);fs.writeFileSync('site/version.json',JSON.stringify({package:pkg.name,version:pkg.version}));}
`, { mode: 0o755 });
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
    const result = spawnSync(process.execPath, ['scripts/prepare-pages.mjs'], { cwd: directory, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(join(directory, 'pages/v0.1.0/index.html'), 'utf8'), 'Synthetic documentation 0.1.0');
    assert.equal(await readFile(join(directory, 'pages/v0.2.0/index.html'), 'utf8'), 'Synthetic documentation 0.2.0');
    assert.equal(await readFile(join(directory, 'pages/latest/index.html'), 'utf8'), 'Synthetic documentation 0.2.0');
    assert.match(await readFile(join(directory, 'pages/index.html'), 'utf8'), /最新安定版 0\.2\.0/);
    const failed = spawnSync(process.execPath, ['scripts/prepare-pages.mjs'], { cwd: directory,
      env: { ...env, SIMULATE_REGISTRY_FAILURE: '1' }, encoding: 'utf8' });
    assert.notEqual(failed.status, 0);
    assert.equal(await readFile(join(directory, 'pages/latest/index.html'), 'utf8'), 'Synthetic documentation 0.2.0');
    await writeFile(join(directory, 'site/version.json'), JSON.stringify({ package: '@bright203/tadorino-sdk-js', version: '0.0.9' }));
    const stale = spawnSync(process.execPath, ['scripts/prepare-pages.mjs'], { cwd: directory, env, encoding: 'utf8' });
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /versions must match/);
    assert.equal(await readFile(join(directory, 'pages/latest/index.html'), 'utf8'), 'Synthetic documentation 0.2.0');
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
