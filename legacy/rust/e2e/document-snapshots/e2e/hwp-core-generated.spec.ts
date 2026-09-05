import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** fixture와 동일한 디렉터리에 ours 저장 (playwright snapshotPathTemplate과 일치) */
const imageSnapshotDir = path.join(__dirname, 'snapshots', 'hwp-core-generated.spec.ts');
/** HTML 스냅샷이 있는 디렉터리 (serve baseURL 기준) */
const snapshotsDir = path.resolve(__dirname, '../../../crates/hwp-core/tests/snapshots');
test.beforeAll(() => {
  fs.mkdirSync(imageSnapshotDir, { recursive: true });
});

const screenshotOpts = { fullPage: true, maxDiffPixelRatio: 0.02 };

/** 스냅샷은 항상 fixture(기준)와 ours(현재 출력) 두 개. ours 저장 후 fixture와 비교. */
test.describe('hwp-core generated HTML image snapshot', () => {
  test('save noori fixture(원본) and ours(현재 출력) as image snapshots', async ({ page }) => {
    await page.goto('/fixtures/noori.html', { waitUntil: 'load', timeout: 15_000 });
    await expect(page.locator('body')).toBeVisible({ timeout: 5_000 });
    await page.screenshot({
      path: path.join(snapshotsDir, 'noori-fixture.png'),
      fullPage: true,
    });
    await page.goto('/snapshots/noori.html', { waitUntil: 'load', timeout: 15_000 });
    await expect(page.locator('body')).toBeVisible({ timeout: 5_000 });
    await page.screenshot({
      path: path.join(snapshotsDir, 'noori-ours.png'),
      fullPage: true,
    });
  });

  test('generated HTML file: charshape.html', async ({ page }) => {
    await page.goto('/snapshots/charshape.html', { waitUntil: 'load', timeout: 15_000 });
    await expect(page.locator('body')).toBeVisible({ timeout: 5_000 });
    await page.screenshot({
      path: path.join(imageSnapshotDir, 'charshape-html-ours.png'),
      fullPage: true,
    });
    await expect(page).toHaveScreenshot('charshape-html-fixture.png', screenshotOpts);
  });
});
