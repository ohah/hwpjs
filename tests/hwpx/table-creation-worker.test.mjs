import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { workerCanvasHarness, dispatchCanvasEvent } from '../canvas/worker-harness.mjs';
import { execFileSync } from '../../tools/oracle-process.mjs';
const options = {
  rows: 2,
  columns: 2,
  width: 101,
  rowHeight: 17,
  resources: { paragraph: 1, character: 1, style: 0, border_fill: 1 },
};
test('Canvas crossing label edit rebases generated table and preserves exact dirty XML and redo', async (t) => {
  const h = await workerCanvasHarness(t, { paintFrames: true });
  await h.send({
    kind: 'load',
    format: 'hwpx',
    bytes: readFileSync(
      'legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwpx',
    ),
  });
  await h.send({ kind: 'enable' });
  const created = await h.send({
    kind: 'insert-table',
    section: 0,
    paragraph: 2,
    unit: 5,
    options: { ...options, rows: 1, columns: 1 },
  });
  assert.equal(created.error, undefined);
  assert.equal(created.content.paragraphs.find((p) => p.paragraph === 2).fieldLabels.length, 1);
  const before = (await h.send({ kind: 'save' })).bytes;
  assert.equal(
    h.controller.selectTextRange({ section: 0, paragraph: 2, startUnit: 0, endUnit: 0 }),
    true,
  );
  assert.equal(h.input.readOnly, false);
  h.input.value = '😀<&' + h.input.value;
  h.input.setSelectionRange(4, 4);
  dispatchCanvasEvent(h.input, 'input');
  const edited = await h.flush();
  assert.equal(edited.error, undefined);
  assert.equal(edited.content.createdTables[0].anchorUnit, 9);
  const after = (await h.send({ kind: 'save' })).bytes;
  for (const flags of [[], ['-O']])
    execFileSync('python3', [...flags, 'tools/hwpx-field-edit-oracle.py'], {
      input: JSON.stringify({
        before: Buffer.from(before).toString('base64'),
        after: Buffer.from(after).toString('base64'),
        paragraph: 3,
        text: '😀<&',
      }),
      timeout: 30000,
    });
  assert.equal(h.controller.history('undo'), true);
  assert.equal((await h.flush()).error, undefined);
  assert.deepEqual((await h.send({ kind: 'save' })).bytes, before);
  assert.equal(h.controller.history('redo'), true);
  assert.equal((await h.flush()).error, undefined);
  assert.deepEqual((await h.send({ kind: 'save' })).bytes, after);
});

test('Worker missing host mode ABI never grants exterior range editing with a pending table', async (t) => {
  const instantiate = WebAssembly.instantiate;
  t.mock.method(WebAssembly, 'instantiate', async (...args) => {
    const instance = await instantiate(...args),
      exports = { ...instance.exports };
    delete exports.hwpx_edit_created_table_host_mode;
    return { exports };
  });
  const h = await workerCanvasHarness(t);
  await h.send({
    kind: 'load',
    format: 'hwpx',
    bytes: readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/hyperlink.hwpx'),
  });
  const enabled = await h.send({ kind: 'enable' });
  assert.equal(enabled.error, undefined);
  const host = enabled.content.paragraphs.find((p) => p.paragraph === 0);
  const unit = host.fieldLabels.at(-1).end + 1;
  const query = {
    kind: 'query-edit-range',
    section: 0,
    paragraph: 0,
    startUnit: unit,
    endUnit: unit,
  };
  assert.equal((await h.send({ ...query, requestId: 1 })).allowed, true);
  assert.equal(
    (await h.send({ kind: 'insert-table', section: 0, paragraph: 1, unit: 0, options })).error,
    undefined,
  );
  const before = (await h.send({ kind: 'save' })).bytes;
  assert.equal((await h.send({ ...query, requestId: 2 })).allowed, false);
  assert.deepEqual((await h.send({ kind: 'save' })).bytes, before);
});

test('Canvas field exterior with missing label ABI uses range permission without unlocking label', async (t) => {
  const instantiate = WebAssembly.instantiate;
  t.mock.method(WebAssembly, 'instantiate', async (...args) => {
    const instance = await instantiate(...args),
      exports = { ...instance.exports };
    delete exports.hwpx_edit_created_table_field_label_mode;
    return { exports };
  });
  const h = await workerCanvasHarness(t, { paintFrames: true, rangeQueries: true });
  const source = readFileSync(
    'legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwpx',
  );
  // Read the original XML independently. Both the field boundary affinity
  // and its interior require the missing explicit label capability.
  const inventoryScript = String.raw`import io,json,sys,zipfile,xml.etree.ElementTree as E
p="{http://www.hancom.co.kr/hwpml/2011/paragraph}"
root=E.fromstring(zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())).read("Contents/section0.xml"))
paragraph=list(root.iter(p+"p"))[1]
offset=0
for node in paragraph.iter():
    if node.tag==p+"fieldBegin":
        print(json.dumps({"start":offset,"id":node.get("id")}))
        break
    if node.tag==p+"t":
        if len(node): raise ValueError("Expected plain source text")
        offset+=len((node.text or "").encode("utf-16-le"))//2
else: raise ValueError("Missing source field")`;
  const inventories = [[], ['-O']].map((flags) =>
    JSON.parse(
      execFileSync('python3', [...flags, '-c', inventoryScript], {
        input: source,
        encoding: 'utf8',
        timeout: 30000,
      }),
    ),
  );
  assert.deepEqual(inventories[0], { start: 7, id: '1528818376' });
  assert.deepEqual(inventories[1], inventories[0]);
  await h.send({ kind: 'load', format: 'hwpx', bytes: source });
  await h.send({ kind: 'enable' });
  const created = await h.send({
    kind: 'insert-table',
    section: 0,
    paragraph: 1,
    unit: 0,
    options: { ...options, rows: 1, columns: 1 },
  });
  assert.equal(created.error, undefined);
  const host = created.content.paragraphs.find((p) => p.paragraph === 1);
  assert.equal(host.editable, false);
  const before = (await h.send({ kind: 'save' })).bytes;
  assert.equal(
    h.controller.selectTextRange({ section: 0, paragraph: 1, startUnit: 0, endUnit: 0 }),
    true,
  );
  await h.flushQueries();
  assert.equal(h.input.readOnly, false);
  h.input.value = '앞😀<&' + h.input.value;
  h.input.setSelectionRange(5, 5);
  dispatchCanvasEvent(h.input, 'input');
  const edited = await h.flush();
  assert.equal(edited.error, undefined);
  assert.equal(edited.content.createdTables[0].anchorUnit, 5);
  await h.flushQueries();
  const after = (await h.send({ kind: 'save' })).bytes;
  for (const flags of [[], ['-O']])
    execFileSync('python3', [...flags, 'tools/hwpx-field-outside-oracle.py'], {
      input: JSON.stringify({
        before: Buffer.from(before).toString('base64'),
        after: Buffer.from(after).toString('base64'),
        part: 'Contents/section0.xml',
        paragraph: 2,
        prefix: '앞😀<&',
      }),
      timeout: 30000,
    });
  const fieldStart = inventories[0].start + '앞😀<&'.length;
  assert.equal(fieldStart, 12);
  assert.equal(
    h.controller.selectTextRange({
      section: 0,
      paragraph: 1,
      startUnit: fieldStart - 1,
      endUnit: fieldStart - 1,
    }),
    true,
  );
  await h.flushQueries();
  assert.equal(h.input.readOnly, false);
  assert.equal(
    h.controller.selectTextRange({
      section: 0,
      paragraph: 1,
      startUnit: fieldStart,
      endUnit: fieldStart,
    }),
    true,
  );
  await h.flushQueries();
  assert.equal(h.input.readOnly, true);
  assert.equal(
    h.controller.selectTextRange({
      section: 0,
      paragraph: 1,
      startUnit: fieldStart + 1,
      endUnit: fieldStart + 1,
    }),
    true,
  );
  await h.flushQueries();
  assert.equal(h.input.readOnly, true);
  const refused = await h.send({
    kind: 'splice',
    origin: 'canvas',
    section: 0,
    paragraph: 1,
    startUnit: fieldStart + 1,
    endUnit: fieldStart + 1,
    text: '금지',
  });
  assert.equal(typeof refused.error, 'string');
  assert.equal(refused.historyRevision, edited.historyRevision);
  assert.deepEqual((await h.send({ kind: 'save' })).bytes, after);
});

test('Canvas numeric formula input with generated body table preserves independent XML and history', async (t) => {
  const h = await workerCanvasHarness(t, { paintFrames: true });
  await h.send({
    kind: 'load',
    format: 'hwpx',
    bytes: readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx'),
  });
  await h.send({ kind: 'enable' });
  const created = await h.send({
    kind: 'insert-table',
    section: 0,
    paragraph: 0,
    unit: 0,
    options: { ...options, rows: 1, columns: 1 },
  });
  assert.equal(created.error, undefined);
  const before = (await h.send({ kind: 'save' })).bytes;
  assert.equal(
    h.controller.selectTextRange({ section: 0, paragraph: 19, startUnit: 0, endUnit: 4 }),
    true,
  );
  assert.equal(h.input.value, '11.2');
  h.input.value = '100';
  h.input.setSelectionRange(3, 3);
  dispatchCanvasEvent(h.input, 'input');
  const edited = await h.flush();
  assert.equal(edited.error, undefined);
  const after = (await h.send({ kind: 'save' })).bytes;
  for (const flags of [[], ['-O']])
    execFileSync('python3', [...flags, 'tools/hwpx-structure-formula-oracle.py'], {
      input: JSON.stringify({
        before: Buffer.from(before).toString('base64'),
        after: Buffer.from(after).toString('base64'),
        value: '100',
      }),
      timeout: 30000,
    });
  assert.equal(h.controller.history('undo'), true);
  assert.equal((await h.flush()).error, undefined);
  assert.deepEqual((await h.send({ kind: 'save' })).bytes, before);
  assert.equal(h.controller.history('redo'), true);
  assert.equal((await h.flush()).error, undefined);
  assert.deepEqual((await h.send({ kind: 'save' })).bytes, after);
});

test('Canvas anchored drawing host preserves original objects table position and redo after refusal', async (t) => {
  const h = await workerCanvasHarness(t, { paintFrames: true });
  const source = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx');
  await h.send({ kind: 'load', format: 'hwpx', bytes: source });
  await h.send({ kind: 'enable' });
  const created = await h.send({
    kind: 'insert-table',
    section: 0,
    paragraph: 0,
    unit: 1,
    options: { ...options, rows: 1, columns: 1 },
  });
  assert.equal(created.error, undefined);
  const host = created.content.paragraphs.find((p) => p.section === 0 && p.paragraph === 0);
  assert.equal(host.anchorEditable, true);
  assert.equal(host.plainEditable, false);
  const table = created.content.createdTables[0],
    before = (await h.send({ kind: 'save' })).bytes;
  assert.equal(
    h.controller.selectTextRange({ section: 0, paragraph: 0, startUnit: 0, endUnit: 0 }),
    true,
  );
  const prefix = '앞😀<&';
  h.input.value = prefix + h.input.value;
  h.input.setSelectionRange(prefix.length, prefix.length);
  dispatchCanvasEvent(h.input, 'input');
  const edited = await h.flush();
  assert.equal(edited.error, undefined);
  assert.equal(edited.content.createdTables[0].anchorUnit, 6);
  const after = (await h.send({ kind: 'save' })).bytes;
  for (const flags of [[], ['-O']])
    execFileSync('python3', [...flags, 'tools/hwpx-drawing-table-insertion-oracle.py'], {
      input: JSON.stringify({
        before: source.toString('base64'),
        after: Buffer.from(after).toString('base64'),
        unit: 1,
        prefix,
        table_id: table.instance_id,
      }),
      timeout: 30000,
    });
  assert.equal(h.controller.history('undo'), true);
  assert.equal((await h.flush()).error, undefined);
  assert.deepEqual((await h.send({ kind: 'save' })).bytes, before);
  assert.equal(
    (await h.send({ kind: 'splice', section: 0, paragraph: 0, startUnit: 0, endUnit: 1, text: '' }))
      .error,
    'ProtectedInlineControl',
  );
  assert.deepEqual((await h.send({ kind: 'save' })).bytes, before);
  assert.equal(h.controller.history('redo'), true);
  assert.equal((await h.flush()).error, undefined);
  assert.deepEqual((await h.send({ kind: 'save' })).bytes, after);
});

test('Canvas source input with generated table rebases anchor and preserves full XML and history', async (t) => {
  const h = await workerCanvasHarness(t, { paintFrames: true });
  await h.send({
    kind: 'load',
    format: 'hwpx',
    bytes: readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx'),
  });
  await h.send({ kind: 'enable' });
  const created = await h.send({
    kind: 'insert-table',
    section: 0,
    paragraph: 1,
    unit: 2,
    options,
  });
  assert.equal(created.error, undefined);
  const table = created.content.createdTables[0];
  const before = (await h.send({ kind: 'save' })).bytes;
  assert.equal(
    h.controller.selectTextRange({ section: 0, paragraph: 1, startUnit: 0, endUnit: 0 }),
    true,
  );
  assert.equal(h.input.disabled, false);
  const text = '앞😀<&';
  h.input.value = text + h.input.value;
  h.input.setSelectionRange(text.length, text.length);
  dispatchCanvasEvent(h.input, 'input');
  const changed = await h.flush();
  assert.equal(changed.error, undefined);
  assert.equal(changed.content.createdTables[0].anchorUnit, 7);
  assert.equal(changed.content.createdTables[0].identity, table.identity);
  const after = (await h.send({ kind: 'save' })).bytes;
  for (const flags of [[], ['-O']])
    execFileSync('python3', [...flags, 'tools/hwpx-plain-splice-oracle.py'], {
      input: JSON.stringify({
        before: Buffer.from(before).toString('base64'),
        after: Buffer.from(after).toString('base64'),
        part: 'Contents/section0.xml',
        index: 1,
        start: 0,
        end: 0,
        text,
        zero_width_table_id: String(table.instance_id),
      }),
      timeout: 30000,
    });
  assert.equal(h.controller.history('undo'), true);
  const undone = await h.flush();
  assert.equal(undone.error, undefined);
  assert.equal(undone.content.createdTables[0].anchorUnit, 2);
  assert.deepEqual((await h.send({ kind: 'save' })).bytes, before);
  assert.equal(
    (await h.send({ kind: 'splice', section: 0, paragraph: 1, startUnit: 0, endUnit: 3, text: '' }))
      .error,
    'ProtectedCreatedTableAnchor',
  );
  assert.equal(
    (
      await h.send({
        kind: 'splice',
        section: 0,
        paragraph: 1,
        startUnit: 0,
        endUnit: 0,
        text: '\0',
      })
    ).error,
    'InvalidXmlCharacter',
  );
  assert.deepEqual((await h.send({ kind: 'save' })).bytes, before);
  assert.equal(h.controller.history('redo'), true);
  const redone = await h.flush();
  assert.equal(redone.error, undefined);
  assert.equal(redone.content.createdTables[0].anchorUnit, 7);
  assert.deepEqual((await h.send({ kind: 'save' })).bytes, after);
});
test('actual Worker keeps source paragraph addresses and created cell identities through history', async (t) => {
  const h = await workerCanvasHarness(t, { paintFrames: true });
  const input = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx');
  assert.equal((await h.send({ kind: 'load', format: 'hwpx', bytes: input })).error, undefined);
  const enabled = await h.send({ kind: 'enable' });
  assert.equal(enabled.error, undefined);
  const before = enabled.content.paragraphs.map((p) => [p.section, p.paragraph, p.text]);
  const created = await h.send({
    kind: 'insert-table',
    section: 0,
    paragraph: 1,
    unit: 0,
    options,
  });
  assert.equal(created.error, undefined);
  assert.equal(created.content.createdTables[0].identity, created.identity);
  assert.equal(created.content.createdTables[0].hostParagraph, 1);
  assert.deepEqual(
    created.content.paragraphs.map((p) => [p.section, p.paragraph, p.text]),
    before,
  );
  assert(created.content.paragraphs.some((p) => p.plainEditable && p.editable));
  assert(
    created.content.paragraphs.every(
      (p) => p.fieldLabels.length === 0 && !p.anchoredSplitAvailable,
    ),
  );
  assert.equal(h.renderer.layout().boxes.filter((box) => box.createdCell).length, 4);
  assert.equal(h.renderer.layout().pageLayoutMode, 'measured-created-inline');
  assert.equal(h.renderer.layout().createdTablesPaginated, true);
  assert(h.renderer.layout().pages.length > 0);
  assert(
    h.renderer
      .layout()
      .boxes.filter((box) => box.createdCell)
      .every((box) => Number.isInteger(box.pageOrdinal) && box.referenceBoxes?.page),
  );
  h.paint();
  const edited = await h.send({
    kind: 'created-cell-text',
    section: 0,
    identity: created.identity,
    row: 0,
    column: 0,
    text: '입력😀<&',
  });
  assert.equal(edited.error, undefined);
  assert.equal(edited.content.createdTables[0].cells[0].text, '입력😀<&');
  assert(h.renderer.layout().rows.some((row) => row.createdCell?.identity === created.identity));
  h.paint();
  const saved = await h.send({ kind: 'save' });
  assert.equal(saved.error, undefined);
  assert.equal((await h.send({ kind: 'undo' })).content.createdTables[0].cells[0].text, '');
  const undone = await h.send({ kind: 'undo' });
  assert.equal(undone.error, undefined);
  assert.deepEqual(undone.content.createdTables, []);
  assert.deepEqual(Buffer.from((await h.send({ kind: 'save' })).bytes), input);
  assert.equal(
    (
      await h.send({
        kind: 'insert-table',
        section: 0,
        paragraph: 1,
        unit: 0,
        options: { ...options, rows: 0 },
      })
    ).error,
    'InvalidTableCreation',
  );
  assert.equal((await h.send({ kind: 'redo' })).error, undefined);
  const redone = await h.send({ kind: 'redo' });
  assert.equal(redone.error, undefined);
  assert.equal(redone.content.createdTables[0].cells[0].text, '입력😀<&');
  assert.deepEqual((await h.send({ kind: 'save' })).bytes, saved.bytes);
  t.diagnostic(
    'Actual Worker/WASM and renderer with simulated Canvas; browser pixels and generated cell input remain unverified',
  );
});

test('Canvas blank generated cell selection retains owner without issuing a source paragraph edit', async (t) => {
  const h = await workerCanvasHarness(t, { paintFrames: true });
  const bytes = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx');
  await h.send({ kind: 'load', format: 'hwpx', bytes });
  await h.send({ kind: 'enable' });
  const created = await h.send({
    kind: 'insert-table',
    section: 0,
    paragraph: 1,
    unit: 0,
    options: { ...options, rows: 1, width: 14400, rowHeight: 1000 },
  });
  assert.equal(created.error, undefined);
  const box = h.renderer.layout().boxes.find((box) => box.createdCell?.column === 1);
  dispatchCanvasEvent(h.canvas, 'pointerdown', {
    pointerId: 1,
    button: 0,
    clientX: box.x + 2,
    clientY: box.y + 2,
  });
  assert.equal(h.input.disabled, false);
  assert.equal(h.input.readOnly, false);
  assert.equal(h.input.value, '');
  assert.equal(h.requests.length, 0);
  h.paint();
});

test('Canvas generated cell composition commits through native identity and rolls back invalid XML', async (t) => {
  const h = await workerCanvasHarness(t, { paintFrames: true });
  const bytes = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx');
  await h.send({ kind: 'load', format: 'hwpx', bytes });
  await h.send({ kind: 'enable' });
  const created = await h.send({
    kind: 'insert-table',
    section: 0,
    paragraph: 1,
    unit: 0,
    options: { ...options, rows: 1, width: 14400, rowHeight: 1000 },
  });
  const box = h.renderer.layout().boxes.find((box) => box.createdCell?.column === 1);
  dispatchCanvasEvent(h.canvas, 'pointerdown', {
    pointerId: 1,
    button: 0,
    clientX: box.x + 2,
    clientY: box.y + 2,
  });
  dispatchCanvasEvent(h.canvas, 'pointerup', {
    pointerId: 1,
    clientX: box.x + 2,
    clientY: box.y + 2,
  });
  dispatchCanvasEvent(h.input, 'compositionstart');
  h.input.value = '조';
  h.input.setSelectionRange(1, 1);
  dispatchCanvasEvent(h.input, 'input');
  assert.equal(h.requests.length, 0);
  assert.equal(
    h.renderer.paragraph({
      section: 0,
      createdCell: { identity: created.identity, row: 0, column: 1 },
    }).text,
    '조',
  );
  h.input.value = '조합😀<&';
  h.input.setSelectionRange(h.input.value.length, h.input.value.length);
  dispatchCanvasEvent(h.input, 'input');
  dispatchCanvasEvent(h.input, 'compositionend');
  await Promise.resolve();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].kind, 'created-cell-text');
  assert.equal(h.requests[0].identity, created.identity);
  assert.equal(h.requests[0].paragraph, undefined);
  const changed = await h.flush();
  assert.equal(changed.error, undefined);
  assert.equal(changed.content.createdTables[0].cells[1].text, '조합😀<&');
  h.paint();
  const saved = await h.send({ kind: 'save' });
  h.input.value = '실패\0';
  h.input.setSelectionRange(3, 3);
  dispatchCanvasEvent(h.input, 'input');
  const refused = await h.flush();
  assert.equal(refused.error, 'InvalidXmlCharacter');
  assert.equal(h.input.value, '조합😀<&');
  assert.deepEqual((await h.send({ kind: 'save' })).bytes, saved.bytes);
  assert.equal(h.controller.history('undo'), true);
  const undone = await h.flush();
  assert.equal(undone.error, undefined);
  assert.equal(undone.content.createdTables[0].cells[1].text, '');
  assert.equal(h.controller.history('redo'), true);
  const redone = await h.flush();
  assert.equal(redone.error, undefined);
  assert.equal(redone.content.createdTables[0].cells[1].text, '조합😀<&');
  assert.deepEqual((await h.send({ kind: 'save' })).bytes, saved.bytes);
});

test('Canvas insertion command uses current source caret and focuses its created first cell', async (t) => {
  const h = await workerCanvasHarness(t, { paintFrames: true });
  await h.send({
    kind: 'load',
    format: 'hwpx',
    bytes: readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx'),
  });
  await h.send({ kind: 'enable' });
  assert.equal(
    h.controller.selectTextRange({ section: 0, paragraph: 1, startUnit: 0, endUnit: 0 }),
    true,
  );
  assert.deepEqual(h.controller.tableCreationSelection(), { section: 0, paragraph: 1, unit: 0 });
  assert(h.controller.tableCreationResources().style.includes(0));
  assert.equal(h.controller.insertTable({ ...options, width: 36000, rowHeight: 1800 }), true);
  const created = await h.flush();
  assert.equal(created.error, undefined);
  assert.equal(h.input.value, '');
  assert.equal(h.input.readOnly, false);
  assert.equal(h.controller.tableCreationSelection(), null);
  h.input.value = '첫 셀😀';
  h.input.setSelectionRange(h.input.value.length, h.input.value.length);
  dispatchCanvasEvent(h.input, 'input');
  const edited = await h.flush();
  assert.equal(edited.error, undefined);
  assert.equal(edited.content.createdTables[0].cells[0].text, '첫 셀😀');
  const count = h.requests.length;
  dispatchCanvasEvent(h.input, 'keydown', { key: 'Tab' });
  assert.equal(h.requests.length, count);
  assert.equal(h.input.value, '');
  h.input.value = '둘째😀';
  h.input.setSelectionRange(h.input.value.length, h.input.value.length);
  dispatchCanvasEvent(h.input, 'input');
  assert.equal(h.requests.at(-1).column, 1);
  const next = await h.flush();
  assert.equal(next.error, undefined);
  assert.equal(next.content.createdTables[0].cells[1].text, '둘째😀');
  dispatchCanvasEvent(h.input, 'keydown', { key: 'Tab', shiftKey: true });
  assert.equal(h.input.value, '첫 셀😀');
  h.paint();
});
