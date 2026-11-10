import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planBrowserPrint,
  openBrowserPrintTarget,
} from '../../web/preview/browser-print-target.mjs';

const jpeg = new Blob(['proof'], { type: 'image/jpeg' });
const page = (ordinal, widthCssPx, heightCssPx) => ({
  ordinal,
  widthCssPx,
  heightCssPx,
  pixelWidth: 800,
  pixelHeight: 1000,
  jpeg,
});
const job = (...pages) => ({ kind: 'paginated-canvas-print-pages', encoding: 'jpeg', pages });
test('named CSS pages use R4 MediaBox points in order and reuse identical sizes', () => {
  const result = planBrowserPrint(
    job(
      page(0, 793.706666666667, 1122.506666666667),
      page(1, 1122.506666666667, 793.706666666667),
      page(2, 793.706666666667, 1122.506666666667),
    ),
  );
  assert.deepEqual(result.rules, [
    '@page hwpSheet0 { size: 595.280000pt 841.880000pt; margin: 0; }',
    '@page hwpSheet1 { size: 841.880000pt 595.280000pt; margin: 0; }',
  ]);
  assert.deepEqual(
    result.pages.map((p) => p.name),
    ['hwpSheet0', 'hwpSheet1', 'hwpSheet0'],
  );
});
test('untrusted order, invalid sheet dimensions and excessive pixel work are rejected', () => {
  assert.throws(() => planBrowserPrint(job(page(1, 800, 1200))), /InvalidBrowserPrintPage/);
  assert.throws(() => planBrowserPrint(job(page(0, '800;}', 1200))), /InvalidBrowserPrintPaper/);
  assert.throws(
    () => planBrowserPrint(job({ ...page(0, 800, 1200), pixelWidth: 8192, pixelHeight: 8192 })),
    /BrowserPrintBudgetExceeded/,
  );
});
test('stale and pre-aborted jobs never attempt to open a popup', () => {
  const document = {
    defaultView: {
      open() {
        assert.fail('Unexpected popup');
      },
    },
  };
  assert.throws(
    () => openBrowserPrintTarget(document, job(page(0, 800, 1200)), { isCurrent: () => false }),
    /StalePrintDocument/,
  );
  const signal = AbortSignal.abort(Error('Cancelled'));
  assert.throws(
    () => openBrowserPrintTarget(document, job(page(0, 800, 1200)), { signal }),
    /Cancelled/,
  );
});
