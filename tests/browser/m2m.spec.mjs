import { test, expect } from '@playwright/test';

const start = page => page.goto('http://127.0.0.1:5174');
test('local machine UI saves/replays/searches/gets without browser credentials', async ({ page, browser }, testInfo) => {
  const title = `機械 ${testInfo.project.name} ${Date.now()}`; const original = '## 合成機械メモ\n全角 ＡＢＣ 😀'; const saves = []; const sensitive = [];
  page.on('request', request => {
    if (request.headers().authorization || request.url().includes('/oauth/token')) sensitive.push(request.url());
    if (request.method() === 'POST' && request.url().endsWith('/api/notes')) saves.push(request.postDataJSON());
  });
  await start(page); await expect(page.getByText('localhost専用の開発例です。', { exact: false })).toBeVisible();
  await page.getByLabel('タイトル', { exact: true }).fill(title); await page.getByLabel('本文 · Markdown').fill(original);
  await page.getByRole('button', { name: 'メモを保存', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('機械のメモを保存しました。');
  await page.getByRole('button', { name: '同じ内容を再送', exact: true }).click(); await expect(page.getByRole('status')).toContainText('重複は作成していません'); expect(saves).toHaveLength(2); expect(saves[1]).toEqual(saves[0]);
  await page.getByLabel('検索キーワード').fill(title); await page.getByRole('button', { name: '検索', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('1件のメモが見つかりました。');
  await page.getByRole('button', { name: new RegExp(title) }).click(); await expect(page.locator('article pre')).toHaveText(original);
  expect(sensitive).toEqual([]); const bootstrap = await page.request.get('http://127.0.0.1:5174/api/bootstrap', { headers: { Accept: 'application/json' } }); expect(Object.keys(await bootstrap.json()).sort()).toEqual(['csrf', 'mode']);
  testInfo.annotations.push({ type: 'browser-version', description: `${browser.version()}; local machine synthetic fixture, no real Auth0/DB` });
});

test('failed save keeps the same key and input for an explicit retry', async ({ page }) => {
  const saves = []; let rejectFirst = true;
  await page.route('**/api/notes', async route => {
    saves.push(route.request().postDataJSON());
    if (rejectFirst) { rejectFirst = false; await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"machine_auth_unavailable"}' }); }
    else await route.continue();
  });
  await start(page); await page.getByRole('button', { name: 'メモを保存', exact: true }).click(); await expect(page.getByRole('status')).toContainText('HTTP 503');
  await expect(page.getByLabel('タイトル', { exact: true })).toBeDisabled(); await page.getByRole('button', { name: '同じ内容を再送', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('機械のメモを保存しました。');
  expect(saves).toHaveLength(2); expect(saves[1]).toEqual(saves[0]);
});

test('cancelled machine save preserves original payload and returns control', async ({ page }) => {
  let release; const held = new Promise(resolve => { release = resolve; });
  await page.route('**/api/notes', async route => { await held; await route.abort('aborted').catch(() => {}); });
  try {
    await start(page); await page.getByRole('button', { name: 'メモを保存', exact: true }).click(); await expect(page.getByRole('button', { name: '操作を中止', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '操作を中止', exact: true }).click(); await expect(page.getByRole('status')).toContainText('操作を中止しました');
    await expect(page.getByRole('button', { name: '同じ内容を再送', exact: true })).toBeEnabled(); await expect(page.getByLabel('タイトル', { exact: true })).toBeDisabled();
  } finally { release(); }
});
