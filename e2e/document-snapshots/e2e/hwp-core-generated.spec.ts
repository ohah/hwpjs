import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** fixture와 동일한 디렉터리에 ours 저장 (playwright snapshotPathTemplate과 일치) */
const imageSnapshotDir = path.join(__dirname, 'snapshots', 'hwp-core-generated.spec.ts');
test.beforeAll(() => {
  fs.mkdirSync(imageSnapshotDir, { recursive: true });
});

const screenshotOpts = { fullPage: true, maxDiffPixelRatio: 0.02 };

/** 스냅샷은 항상 fixture(기준)와 ours(현재 출력) 두 개. ours 저장 후 fixture와 비교. */
test.describe('hwp-core generated HTML image snapshot', () => {
  test('generated HTML file: charshape.html', async ({ page }) => {
    await page.goto('/charshape.html', { waitUntil: 'load', timeout: 15_000 });
    await expect(page.locator('body')).toBeVisible({ timeout: 5_000 });
    await page.screenshot({
      path: path.join(imageSnapshotDir, 'charshape-html-ours.png'),
      fullPage: true,
    });
    await expect(page).toHaveScreenshot('charshape-html-fixture.png', screenshotOpts);
  });
});
