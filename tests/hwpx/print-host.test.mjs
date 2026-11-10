import test from 'node:test';
import assert from 'node:assert/strict';
import { planPrintRaster } from '../../web/preview/print-raster-plan.mjs';
import { indexPrintPageScene } from '../../web/preview/print-page-scene.mjs';
import { createPrintPdf } from '../../web/preview/print-pdf.mjs';

const pages = (count, width = 794, height = 1123) =>
  Array.from({ length: count }, (_, ordinal) => ({
    section: 0,
    ordinal,
    paper: { x: 20, y: 20 + ordinal * (height + 20), width, height },
  }));
test('tall document fits independent page budgets while large sheets and total work are refused', () => {
  const result = planPrintRaster({ state: 'paginated', pages: pages(11) }, 2);
  assert.equal(result.pages.length, 11);
  assert.equal(result.maxPagePixels, 1588 * 2246);
  assert.equal(result.totalPixels, 11 * result.maxPagePixels);
  assert.throws(
    () => planPrintRaster({ state: 'paginated', pages: pages(23) }, 2),
    /PrintRasterBudgetExceeded/,
  );
  assert.throws(
    () => planPrintRaster({ state: 'paginated', pages: pages(1, 6000, 2000) }),
    /PrintRasterBudgetExceeded/,
  );
  assert.throws(
    () => planPrintRaster({ state: 'paginated', pages: pages(201, 10, 10) }),
    /PrintPageCountBudgetExceeded/,
  );
});
test('index preserves source paint order, handles cross-page objects, and excludes gaps', () => {
  const paper = pages(3, 100, 100).map((page) => page.paper);
  const items = [
    { id: 1, y: 90, height: 145 },
    { id: 2, y: 145, height: 1 },
    { id: 3, y: 120, height: 20 },
  ];
  const scene = indexPrintPageScene(paper, [{ key: 'items', items, bounds: (item) => item }]);
  assert.equal(scene.visits, 3);
  assert.deepEqual(
    scene.pageScenes.map(({ items }) => items.map((item) => item.id)),
    [[1], [1, 2], []],
  );
  const large = Array.from({ length: 1300 }, () => ({ y: 0, height: 24000 }));
  assert.throws(
    () =>
      indexPrintPageScene(
        pages(200, 100, 100).map((p) => p.paper),
        [{ key: 'items', items: large, bounds: (item) => item }],
      ),
    /PrintSceneVisitBudgetExceeded/,
  );
});
// Minimal 2 × 3 RGB JPEG for SOF geometry and binary xref checks.
const jpeg = new Blob(
  [
    Buffer.from(
      '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAADAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==',
      'base64',
    ),
  ],
  { type: 'image/jpeg' },
);
const sheet = (ordinal, widthCssPx, heightCssPx) => ({
  ordinal,
  jpeg,
  pixelWidth: 2,
  pixelHeight: 3,
  widthCssPx,
  heightCssPx,
});
const job = (...pages) => ({ kind: 'paginated-canvas-print-pages', encoding: 'jpeg', pages });
test('PDF uses ordered MediaBoxes and byte-accurate xref offsets across binary data', async () => {
  const pdf = await createPrintPdf(job(sheet(0, 800, 1200), sheet(1, 1200, 800)));
  assert.equal(pdf.type, 'application/pdf');
  const text = Buffer.from(await pdf.arrayBuffer()).toString('latin1');
  assert.match(text, /\/Count 2/);
  assert.match(text, /\/MediaBox \[0 0 600.000000 900.000000\]/);
  assert.match(text, /\/MediaBox \[0 0 900.000000 600.000000\]/);
  const offset = Number(/startxref\n(\d+)\n/.exec(text)[1]);
  const lines = text.slice(offset).split('\n');
  assert.deepEqual(lines.slice(0, 3), ['xref', '0 9', '0000000000 65535 f ']);
  for (let id = 1; id < 9; id++) {
    const object = Number(lines[id + 2].slice(0, 10));
    assert.equal(text.slice(object, object + 7), `${id} 0 obj`);
  }
});
test('PDF rejects invalid order, JPEG geometry, media size and cancellation', async () => {
  await assert.rejects(createPrintPdf(job(sheet(1, 800, 1200))), /InvalidPrintPdfPage/);
  await assert.rejects(
    createPrintPdf(job({ ...sheet(0, 800, 1200), pixelHeight: 2 })),
    /InvalidPrintPdfJpeg/,
  );
  await assert.rejects(createPrintPdf(job(sheet(0, -800, 1200))), /InvalidPrintPdfMediaBox/);
  await assert.rejects(
    createPrintPdf(job(sheet(0, 800, 1200)), { signal: AbortSignal.abort(Error('cancelled')) }),
    /cancelled/,
  );
});
