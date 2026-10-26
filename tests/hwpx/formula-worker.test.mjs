import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from '../../tools/oracle-process.mjs';
import { layoutPageContent } from '../../web/preview/page-content-layout.mjs';

test('actual Worker formula edit refreshes current results and history', async (t) => {
  const previousSelf = globalThis.self,
    previousFetch = globalThis.fetch,
    replies = [];
  globalThis.self = {
    postMessage(value) {
      replies.push(value);
    },
  };
  globalThis.fetch = async () =>
    new Response(readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm'));
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousSelf === undefined) delete globalThis.self;
    else globalThis.self = previousSelf;
  });
  await import(`../../web/preview/reader-worker.mjs?formula=${Date.now()}`);
  const send = async (data) => {
    await self.onmessage({ data });
    assert.equal(replies.length, 1);
    return replies.shift();
  };
  const loaded = await send({
    kind: 'load',
    format: 'hwpx',
    bytes: readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx'),
  });
  assert.equal(loaded.error, undefined);
  assert.deepEqual(loaded.content.formulaErrors, []);
  assert.equal(loaded.content.formulas.length, 13);
  const originalPages = layoutPageContent(loaded.content, () => 8);
  assert.equal(originalPages.state, 'paginated');
  assert.equal(new Set(originalPages.boxes.map((box) => box.tableNode)).size, 4);
  const irrelevantFloating = structuredClone(loaded.content);
  for (const table of irrelevantFloating.tables) {
    Object.assign(table.sourceGeometry, {
      text_wrap: 3,
      text_flow: 2,
      flow_with_text: false,
      allow_overlap: true,
      vertical_relative: 0,
      horizontal_relative: 0,
      vertical_alignment: 2,
      horizontal_alignment: 2,
    });
    Object.assign(table.sourceGeometry.geometry, {
      horizontal_offset: 0xffffffff,
      vertical_offset: 0xffffffff,
    });
  }
  assert.deepEqual(
    layoutPageContent(irrelevantFloating, () => 8),
    originalPages,
    'floating-only fields must not move inline tables',
  );
  for (const paragraph of loaded.content.paragraphs.filter((p) => p.tableCell)) {
    assert.equal(
      originalPages.rows
        .filter(
          (row) =>
            row.kind === 'text' &&
            row.section === paragraph.section &&
            row.paragraph === paragraph.paragraph,
        )
        .map((row) => row.text)
        .join(''),
      paragraph.text,
    );
  }
  const first = loaded.content.formulas[0];
  const command = {
    kind: 'formula-definition',
    section: first.section,
    beginElement: first.beginElement,
    formula: '=AVG(B?:E?)',
  };
  assert.equal((await send(command)).error, 'EditorNotOpen');
  assert.equal((await send({ kind: 'enable' })).error, undefined);
  const host = loaded.content.tables[0].hostParagraph;
  const mixed = await send({
    kind: 'splice',
    section: 0,
    paragraph: host,
    startUnit: 0,
    endUnit: 0,
    text: '전',
  });
  assert.equal(mixed.error, undefined);
  const mixedPages = layoutPageContent(mixed.content, () => 8);
  assert.equal(mixedPages.state, 'paginated', mixedPages.error);
  const mixedRows = mixedPages.rows.filter(
    (row) => row.kind === 'text' && row.section === 0 && row.paragraph === host,
  );
  assert.equal(mixedRows.map((row) => row.text).join(''), '전\ufffc');
  assert.equal(mixedRows.flatMap((row) => row.inlineTables ?? []).length, 1);
  const undoneMixed = await send({ kind: 'undo' });
  assert.deepEqual(
    layoutPageContent(undoneMixed.content, () => 8),
    originalPages,
  );
  const changed = await send(command);
  assert.equal(changed.error, undefined);
  assert.equal(changed.content.formulas[0].last_result, '16.875');
  assert.equal(layoutPageContent(changed.content, () => 8).state, 'paginated');
  const oldText = loaded.content.paragraphs.map((p) => p.text);
  const newText = changed.content.paragraphs.map((p) => p.text);
  assert.equal(newText.filter((text, index) => text !== oldText[index]).length, 1);
  assert.equal((await send({ kind: 'undo' })).content.formulas[0].formula, first.formula);
  assert.equal(
    (await send({ ...command, formula: '=SUM(A1:ZZ999)' })).error,
    'FormulaReferenceOutOfBounds',
  );
  assert.equal((await send({ kind: 'redo' })).content.formulas[0].last_result, '16.875');
  const split = await send({ kind: 'split', section: 0, paragraph: 1, atUnit: 1 });
  assert.equal(split.error, undefined);
  assert.deepEqual(split.content.formulaErrors, []);
  assert.equal(split.content.formulas[0].beginElement, first.beginElement);
  assert.equal(split.content.formulas[0].owner.table, first.owner.table);
  const afterSplit = await send({ ...command, formula: first.formula });
  assert.equal(afterSplit.error, undefined);
  assert.equal(afterSplit.content.formulas[0].last_result, '67.5');
  assert.equal((await send({ kind: 'undo' })).content.formulas[0].last_result, '16.875');
  const beforeProduct = Buffer.from((await send({ kind: 'save' })).bytes);
  for (const [formula, display] of [
    ['=PRODUCT(B?:E?)', '68,991.2'],
    ['=PRODUCT(B?,C?,B?)', '3,098.37'],
    ['=MIN(B?:E?)', '11.2'],
    ['=MAX(B?,C?,B?)', '24.7'],
    ['=AVERAGE(B?:E?)', '16.875'],
  ]) {
    const product = await send({ ...command, formula });
    assert.equal(product.error, undefined);
    assert.equal(product.content.formulas[0].formula, formula);
    assert.equal(product.content.formulas[0].last_result, display);
    const saved = Buffer.from((await send({ kind: 'save' })).bytes);
    for (const flags of [[], ['-O']]) {
      const oracle = spawnSync('python3', [...flags, 'tools/hwpx-formula-definition-oracle.py'], {
        input: JSON.stringify({
          before: beforeProduct.toString('base64'),
          after: saved.toString('base64'),
          ordinal: 0,
          formula,
        }),
        encoding: 'utf8',
        timeout: 30000,
      });
      assert.equal(oracle.status, 0, String(oracle.error ?? oracle.stderr));
    }
    assert.equal((await send({ kind: 'undo' })).error, undefined);
    assert.deepEqual(Buffer.from((await send({ kind: 'save' })).bytes), beforeProduct);
    assert.equal(
      (await send({ ...command, formula: '=UNKNOWN(B?:E?)' })).error,
      'UnsupportedFormulaExpression',
    );
    assert.deepEqual(Buffer.from((await send({ kind: 'save' })).bytes), beforeProduct);
    assert.equal((await send({ kind: 'redo' })).content.formulas[0].last_result, display);
    assert.deepEqual(Buffer.from((await send({ kind: 'save' })).bytes), saved);
    assert.equal((await send({ kind: 'undo' })).error, undefined);
  }
});
