import { Application } from 'typedoc';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const app = await Application.bootstrapWithPlugins({ options: path.join(root, 'typedoc.config.mjs') });
const project = await app.convert();
if (!project || app.logger.hasErrors() || app.logger.hasWarnings()) throw new Error('SDK documentation conversion failed.');
app.validate(project);
if (app.logger.hasErrors() || app.logger.hasWarnings()) throw new Error('SDK documentation validation failed.');
await app.generateDocs(project, app.options.getValue('out'));
if (app.logger.hasErrors() || app.logger.hasWarnings()) throw new Error('SDK documentation generation failed.');
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
await writeFile('site/version.json', JSON.stringify({ package: '@bright203/tadorino-sdk-js', version }) + '\n');
if (process.argv.includes('--check')) {
  const collect = async (dir) => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(async entry => entry.isDirectory() ? collect(path.join(dir, entry.name)) : [path.join(dir, entry.name)]))).flat();
  const files = await collect('site');
  assert(files.some(file => file.endsWith('/classes/index.TadorinoClient.html')));
  assert(files.some(file => file.endsWith('/classes/index.TadorinoError.html')));
  assert(files.some(file => file.endsWith('/documents/Installation.html')));
  for (const file of files.filter(item => item.endsWith('.html'))) {
    const html = await readFile(file, 'utf8');
    for (const match of html.matchAll(/(?:href|src)="([^"<>]+)"/g)) {
      const url = match[1];
      if (/^(?:https?:|mailto:|data:|#)/.test(url)) continue;
      const [relative] = url.split(/[?#]/);
      if (!relative) continue;
      const target = path.resolve(path.dirname(file), decodeURIComponent(relative));
      const contents = await readFile(target).catch(() => null);
      assert(contents, `Generated documentation contains a missing local reference in ${file}.`);
    }
  }
  console.log(`Documentation ${version}: public API, guides and local references verified.`);
}
