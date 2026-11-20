// Prepared public product E2E. Main supplies an already approved page and exact
// official SDK/gallery assets; this module never starts a browser or an engine.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const sha = (b) => createHash('sha256').update(b).digest('hex');
function approved(file) {
  assert.ok(
    !/(^|\/)legacy\/hwpers(\/|$)|(^|\/)tests\/hwpx\/title-column-roundtrip\.test\.mjs$|(^|\/)hwpers_test4_complex_table\.hwp$/u.test(
      file,
    ),
    'unapproved fixture',
  );
  return file;
}
export async function runStrictDemoProductE2E({
  page,
  url,
  fixture,
  fixtureSHA256,
  fontFile,
  fontSHA256,
  wasmSHA256,
  workerAssetURL,
  workerSHA256,
  caretPoint,
  output,
}) {
  await mkdir(output, { recursive: false });
  const evidence = { steps: [], downloads: [], workerUrls: [], assetPins: [], executed: false };
  const responses = [];
  let responseFailure;
  page.on('worker', (worker) => evidence.workerUrls.push(worker.url()));
  page.on('download', (download) => evidence.downloads.push(download.suggestedFilename()));
  page.on('response', (response) => {
    const worker = response.url() === workerAssetURL;
    if (worker || new URL(response.url()).pathname.endsWith('.wasm')) {
      responses.push(
        response
          .body()
          .then((bytes) => {
            const actual = sha(bytes);
            assert.equal(actual, worker ? workerSHA256 : wasmSHA256);
            evidence.assetPins.push({
              url: response.url(),
              sha256: actual,
              kind: worker ? 'worker' : 'wasm',
            });
          })
          .catch((error) => {
            responseFailure ??= error;
          }),
      );
    }
  });
  const checkAssets = async () => {
    await Promise.all(responses);
    if (responseFailure) throw responseFailure;
    for (const kind of ['worker', 'wasm'])
      assert.ok(
        evidence.assetPins.some((pin) => pin.kind === kind),
        `actual ${kind} HTTP pin required`,
      );
    assert.ok(evidence.workerUrls.length > 0, 'actual Worker required');
  };
  const openFileMenu = async () => {
    const menu = page.locator('.hwp-demo-menus > details').first();
    if (!(await menu.evaluate((node) => node.open))) await menu.locator(':scope > summary').click();
  };
  try {
    assert.equal(sha(await readFile(approved(fixture))), fixtureSHA256);
    assert.equal(sha(await readFile(approved(fontFile))), fontSHA256);
    assert.ok(
      caretPoint && [caretPoint.x, caretPoint.y].every((v) => Number.isFinite(v) && v > 0),
      'verified actual Canvas caret required',
    );
    assert.ok(
      new URL(url).pathname.endsWith('/demo/vanilla'),
      'official public vanilla route required',
    );
    await page.goto(url);
    await page.locator('[data-role="file-picker"]').setInputFiles(fixture);
    await page.waitForFunction(
      () => document.querySelector('[data-role="strict-layout-save"]')?.disabled === false,
    );
    await checkAssets();
    evidence.steps.push('public shell existing HeadlessEditor and canonical Worker available');
    await page.locator('[data-hwpjs-surface] canvas').first().click({ position: caretPoint });
    await page.locator('[data-hwpjs-document-input]').press('End');
    await page.locator('[data-hwpjs-document-input]').press('A');
    await openFileMenu();
    const stale = page.locator('[data-role="allow-stale-layout"]');
    assert.equal(await stale.isChecked(), false);
    await page.locator('[data-command="save"]:visible').first().click();
    await page.waitForFunction(() =>
      document
        .querySelector('.hwp-demo-statusbar output')
        ?.textContent.includes('LayoutReflowRequired'),
    );
    assert.equal(evidence.downloads.length, 0);
    evidence.steps.push('ordinary dirty save refuses without stale consent or download');
    await openFileMenu();
    const options = page.locator('[data-role="strict-layout-save-options"]');
    if (!(await options.evaluate((node) => node.open)))
      await options.locator(':scope > summary').click();
    await page.locator('[data-role="strict-layout-font"]').setInputFiles(fontFile);
    const downloadEvent = page.waitForEvent('download');
    await page.locator('[data-role="strict-layout-save"]').click();
    const download = await downloadEvent,
      saved = path.join(output, 'public-strict-measured.hwp');
    await download.saveAs(saved);
    await page.waitForFunction(
      () => document.querySelector('[data-role="strict-layout-save"]')?.dataset.state === 'saved',
    );
    assert.equal(await stale.isChecked(), false);
    evidence.saved = {
      bytes: (await readFile(saved)).length,
      sha256: sha(await readFile(saved)),
      fontSHA256,
    };
    evidence.steps.push(
      'explicit public tool uses owned browser font producer and same strict Worker session',
    );
    await page.locator('[data-role="file-picker"]').setInputFiles(saved);
    await page.waitForFunction(
      () => document.querySelector('[data-role="strict-layout-save"]')?.disabled === false,
    );
    await openFileMenu();
    const reopened = page.waitForEvent('download');
    await page.locator('[data-command="save"]:visible').first().click();
    const again = await reopened,
      againFile = path.join(output, 'public-strict-reopened.hwp');
    await again.saveAs(againFile);
    assert.equal(sha(await readFile(againFile)), evidence.saved.sha256);
    await checkAssets();
    evidence.steps.push('public file reopen and ordinary unchanged save byte equality');
    evidence.executed = true;
    evidence.passed = true;
  } catch (error) {
    evidence.passed = false;
    evidence.error = { name: error.name, message: error.message };
    await writeFile(path.join(output, 'FIRST-FAILURE.json'), JSON.stringify(evidence, null, 2), {
      flag: 'wx',
    });
    throw error;
  } finally {
    await writeFile(path.join(output, 'RESULT.json'), JSON.stringify(evidence, null, 2), {
      flag: 'wx',
    });
  }
  return evidence;
}
