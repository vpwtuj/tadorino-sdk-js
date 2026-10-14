import { test, expect } from '@playwright/test';

const body = '## SDKブラウザ確認\n合成データの原文を取り出します。';

test('packed React SDK saves, replays one key, searches and retrieves original memo', async ({ page, browser }, testInfo) => {
  const title = `SDK ${testInfo.project.name} ${Date.now()}`;
  const requests = [];
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/v1/notes')) requests.push(request.postDataJSON()); });
  await page.goto('/');
  await expect(page.getByText('ローカルの合成データ専用モードです。', { exact: false })).toBeVisible();
  await page.getByLabel('タイトル', { exact: true }).fill(title);
  await page.getByLabel('本文 · Markdown').fill(body);
  await page.getByRole('button', { name: 'メモを保存', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('メモを保存しました。検索して全文を取り出せます。');
  await expect(page.getByLabel('タイトル', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '同じ内容を再送', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('同じメモの保存を確認しました。重複は作成していません。');
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  await page.getByLabel('検索キーワード').fill(title);
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('1件のメモが見つかりました。');
  await page.getByRole('button', { name: new RegExp(title) }).click();
  await expect(page.getByRole('status')).toHaveText('メモの全文を取り出しました。');
  await expect(page.locator('article pre')).toHaveText(body);
  await page.getByRole('button', { name: '新しい保存を開始', exact: true }).click();
  await expect(page.getByLabel('タイトル', { exact: true })).toBeEnabled();
  testInfo.annotations.push({ type: 'browser-version', description: `${testInfo.project.name} ${browser.version()}; synthetic fixture; real Auth0/PostgreSQL not tested` });
});

test('HTTP error remains a visible failure, rather than an empty search success', async ({ page }) => {
  await page.route('**/v1/notes/search', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fulfill({ status: 503, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': 'http://127.0.0.1:5173' }, body: JSON.stringify({ error: { code: 'temporarily_unavailable', message: 'synthetic fixture only' } }) });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '検索', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('http · HTTP 503');
  await expect(page.getByRole('status')).not.toContainText('見つかりました');
});

test('cancellation returns control while preserving the initial save input', async ({ page }) => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route('**/v1/notes', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    await held;
    await route.abort('aborted').catch(() => {});
  });
  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'メモを保存', exact: true }).click();
    await expect(page.getByRole('button', { name: '操作を中止', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '操作を中止', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('aborted');
    await expect(page.getByRole('button', { name: '同じ内容を再送', exact: true })).toBeEnabled();
    await expect(page.getByLabel('タイトル', { exact: true })).toBeDisabled();
  } finally { release(); }
});
