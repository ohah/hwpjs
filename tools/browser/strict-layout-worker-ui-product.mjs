// Prepared E2E; receives an already approved browser page. No browser launch,
// wasm replacement, native registration override or direct editor test shortcut.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function approvedFile(file) {
  if (
    /(^|\/)legacy\/hwpers(\/|$)|(^|\/)tests\/hwpx\/title-column-roundtrip\.test\.mjs$|(^|\/)hwpers_test4_complex_table\.hwp$/u.test(
      file,
    )
  )
    throw Error('UnapprovedE2EInput');
  return file;
}
export async function runStrictWorkerUiProductE2E({
  page,
  url,
  fixture,
  fontFile,
  fixtureSHA256,
  fontSHA256,
  wasmSHA256,
  output,
  caretPoint,
}) {
  assert.equal(sha(await readFile(approvedFile(fixture))), fixtureSHA256);
  assert.equal(sha(await readFile(approvedFile(fontFile))), fontSHA256);
  assert.ok(
    caretPoint && [caretPoint.x, caretPoint.y].every((n) => Number.isFinite(n) && n > 0),
    'verified fixture caret point required',
  );
  await mkdir(output, { recursive: false });
  const evidence = {
    steps: [],
    workerUrls: [],
    wasm: [],
    downloads: [],
    scope: 'real product UI and reader-worker; no Native/official acceptance claim',
  };
  page.on('worker', (worker) => evidence.workerUrls.push(worker.url()));
  const responsePins = [];
  let responseFailure;
  page.on('response', (response) => {
    if (response.url().endsWith('/hwpjs.wasm'))
      responsePins.push(
        response
          .body()
          .then((bytes) => {
            const digest = sha(bytes);
            evidence.wasm.push({ url: response.url(), sha256: digest });
            assert.equal(digest, wasmSHA256);
          })
          .catch((error) => {
            responseFailure ??= error;
          }),
      );
  });
  page.on('download', (download) => evidence.downloads.push(download.suggestedFilename()));
  try {
    await page.goto(url);
    await page.waitForFunction(() => !document.querySelector('#file').disabled);
    await page.locator('#file').setInputFiles(fixture);
    await page.locator('#enable-edit').click();
    await page.waitForFunction(() => !document.querySelector('#download-measured').disabled);
    assert.ok(evidence.workerUrls.some((u) => u.endsWith('/reader-worker.mjs')));
    await Promise.all(responsePins);
    if (responseFailure) throw responseFailure;
    assert.ok(evidence.wasm.length > 0);
    evidence.steps.push('actual product Worker and explicit History activation');
    await page.locator('#strict-save-options').evaluate((node) => {
      node.open = true;
    });
    const staleBefore = await page.locator('#allow-stale-layout').isChecked();
    assert.equal(staleBefore, false, 'default safe policy must already be unchecked');
    // The fixture must be an approved own modern plain body. A real input event
    // dirties the Native editor; fixtures are never substituted for save output.
    await page.locator('#canvas').click({ position: caretPoint });
    await page.locator('#canvas-input').press('End');
    await page.locator('#canvas-input').press('A');
    await page.waitForFunction(() => !document.querySelector('#download-measured').disabled);
    await page.locator('#download').click();
    await page.waitForFunction(() =>
      document.querySelector('#download-status').textContent.includes('LayoutReflowRequired'),
    );
    assert.equal(evidence.downloads.length, 0);
    evidence.steps.push('unchanged default safe save refuses dirty HWP5');
    await page.locator('#strict-save-font').setInputFiles(fontFile);
    const pendingDownload = page.waitForEvent('download');
    await page.locator('#download-measured').click();
    const download = await pendingDownload;
    const saved = path.join(output, 'strict-measured.hwp');
    await download.saveAs(saved);
    assert.equal(await page.locator('#allow-stale-layout').isChecked(), staleBefore);
    await page.waitForFunction(
      () => document.querySelector('#download-measured').dataset.state === 'saved',
    );
    evidence.saved = {
      sha256: sha(await readFile(saved)),
      bytes: (await readFile(saved)).length,
      fontSHA256,
    };
    assert.ok(evidence.saved.bytes > 0);
    evidence.steps.push(
      'explicit product Window FontFace producer -> Worker strict commit -> download',
    );
    await page.locator('#file').setInputFiles(saved);
    await page.locator('#enable-edit').click();
    await page.waitForFunction(() => !document.querySelector('#download').disabled);
    const reopened = page.waitForEvent('download');
    await page.locator('#download').click();
    const again = await reopened;
    const againFile = path.join(output, 'strict-reopened.hwp');
    await again.saveAs(againFile);
    assert.equal(sha(await readFile(againFile)), evidence.saved.sha256);
    evidence.steps.push('product reopen and unchanged default save byte equality');
    await Promise.all(responsePins);
    if (responseFailure) throw responseFailure;
    assert.ok(evidence.wasm.length > 0);
    evidence.passed = true;
  } catch (error) {
    evidence.passed = false;
    evidence.error = { name: error.name, message: error.message };
    await writeFile(path.join(output, 'FIRST-FAILURE.json'), JSON.stringify(evidence, null, 2));
    throw error;
  } finally {
    await writeFile(path.join(output, 'RESULT.json'), JSON.stringify(evidence, null, 2));
  }
  return evidence;
}
