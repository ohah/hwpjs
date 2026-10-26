import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
import { createHwpxReader } from '../../js/hwpx.mjs';
import { execFileSync } from '../../tools/oracle-process.mjs';

for (const missing of [
  'hwpx_edit_set_manual_formula_result',
  'hwpx_edit_manual_formula_result_max_bytes',
])
  test(`manual result missing ${missing} refuses without changing history`, async (t) => {
    const instantiate = WebAssembly.instantiate;
    t.mock.method(WebAssembly, 'instantiate', async (...args) => {
      const instance = await instantiate(...args),
        exports = { ...instance.exports };
      delete exports[missing];
      return { exports };
    });
    const editor = await createHwpxEditor(
      readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm'),
    );
    const input = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx');
    try {
      editor.open(input);
      editor.enableHistory();
      const revision = editor.historyRevision();
      assert.throws(
        () => editor.setManualFormulaResult(0, editor.formulaSources(0)[0].begin_element, 'text'),
        { message: 'HwpxManualFormulaResultAbiUnavailable' },
      );
      assert.equal(editor.historyRevision(), revision);
      assert.deepEqual(Buffer.from(editor.save()), input);
    } finally {
      editor.close();
    }
  });

for (const limit of [0, NaN, 32])
  test(`manual result validates native capability limit ${limit}`, async (t) => {
    const instantiate = WebAssembly.instantiate;
    let calls = 0;
    t.mock.method(WebAssembly, 'instantiate', async (...args) => {
      const instance = await instantiate(...args),
        exports = { ...instance.exports };
      exports.hwpx_edit_manual_formula_result_max_bytes = () => limit;
      exports.hwpx_edit_set_manual_formula_result = () => {
        calls++;
        return 1;
      };
      return { exports };
    });
    const editor = await createHwpxEditor(
      readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm'),
    );
    const input = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx');
    try {
      editor.open(input);
      assert.throws(
        () =>
          editor.setManualFormulaResult(
            0,
            editor.formulaSources(0)[0].begin_element,
            '가'.repeat(11),
          ),
        { message: limit === 32 ? 'LimitExceeded' : 'InvalidManualFormulaResultLimit' },
      );
      assert.equal(calls, 0);
      assert.deepEqual(Buffer.from(editor.save()), input);
    } finally {
      editor.close();
    }
  });

test('manual formula result public API preserves complete XML ZIP source caches and history', async () => {
  const input = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx');
  const original = Buffer.from(input);
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm');
  const editor = await createHwpxEditor(wasm);
  let reader;
  try {
    reader = await createHwpxReader(wasm);
    editor.open(input);
    editor.enableHistory({ maxEntries: 8, maxCheckpointBytes: 4 * 1024 * 1024 });
    const source = editor.formulaSources(0)[0];
    const display = '수동😀<&';
    editor.setManualFormulaResult(0, source.begin_element, display);
    const saved = Buffer.from(editor.save());
    assert.equal(editor.formulaCurrent(0)[0].values.last_result, display);
    assert.equal(editor.paragraphTextSnapshot(0)[23].text, display);
    assert.deepEqual(editor.formulaSources(0)[0], source);
    for (const flags of [[], ['-O']])
      execFileSync('python3', [...flags, 'tools/hwpx-manual-result-save-oracle.py'], {
        input: JSON.stringify({
          before: original.toString('base64'),
          after: saved.toString('base64'),
          ordinal: 0,
          display,
          selfTest: true,
        }),
        timeout: 30000,
      });
    const revision = editor.historyRevision();
    editor.setManualFormulaResult(0, source.begin_element, display);
    assert.equal(editor.historyRevision(), revision);
    assert.equal(editor.undo(), true);
    assert.deepEqual(Buffer.from(editor.save()), original);
    const undoneRevision = editor.historyRevision();
    for (const [invalid, message] of [
      ['\0', 'InvalidXmlCharacter'],
      ['\u000b', 'InvalidXmlCharacter'],
      ['\ufffe', 'InvalidXmlCharacter'],
      ...[
        '\ud800',
        '\udc00',
        '\ud800x',
        '\ud800\ud800',
        '\udc00\ud800',
        null,
        undefined,
        0,
        {},
        new String('text'),
      ].map((value) => [value, 'InvalidText']),
      ['x'.repeat(4097), 'LimitExceeded'],
    ]) {
      assert.throws(() => editor.setManualFormulaResult(0, source.begin_element, invalid), {
        message,
      });
      assert.deepEqual(Buffer.from(editor.save()), original);
      assert.equal(editor.historyRevision(), undoneRevision);
    }
    assert.throws(() => editor.setManualFormulaResult(-1, source.begin_element, display), {
      message: 'InvalidInteger',
    });
    assert.throws(() => editor.setManualFormulaResult(0, 0, display), {
      message: 'InvalidFormulaFieldNode',
    });
    assert.equal(editor.historyRevision(), undoneRevision);
    assert.equal(editor.redo(), true);
    assert.deepEqual(Buffer.from(editor.save()), saved);
    const events = reader.readTextEvents(saved).events;
    assert.equal(
      events
        .filter(
          (event) => event.kind === 'content' && event.section === 0 && event.paragraph === 24,
        )
        .map((event) => event.value)
        .join(''),
      display,
    );
    editor.open(saved);
    assert.deepEqual(Buffer.from(editor.save()), saved);
    assert.deepEqual(input, original);
  } finally {
    editor.close();
    reader?.close();
  }
});

test('manual formula result referenced numeric edit recalculates only its owner and preserves saved redo', async () => {
  const input = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx');
  const editor = await createHwpxEditor(
    readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm'),
  );
  try {
    editor.open(input);
    const fields = editor.formulaSources(0);
    editor.setManualFormulaResult(0, fields[0].begin_element, '수동');
    editor.setManualFormulaResult(0, fields[1].begin_element, '다른 수동');
    editor.enableHistory({ maxEntries: 8, maxCheckpointBytes: 4 * 1024 * 1024 });
    const before = Buffer.from(editor.save());
    editor.splice(0, 20, 0, 4, '12');
    const saved = Buffer.from(editor.save());
    assert.equal(editor.formulaCurrent(0)[0].values.last_result, '68.3');
    assert.equal(editor.formulaCurrent(0)[1].values.last_result, '다른 수동');
    for (const flags of [[], ['-O']])
      execFileSync('python3', [...flags, 'tools/hwpx-manual-result-save-oracle.py'], {
        input: JSON.stringify({
          before: before.toString('base64'),
          after: saved.toString('base64'),
          ordinal: 0,
          mode: 'recalculate',
          selfTest: true,
        }),
        timeout: 30000,
      });
    assert.equal(editor.undo(), true);
    assert.deepEqual(Buffer.from(editor.save()), before);
    assert.throws(() => editor.splice(0, 20, 0, 4, 'bad'), { message: 'InvalidFormulaNumber' });
    assert.equal(editor.formulaCurrent(0)[0].values.last_result, '수동');
    assert.equal(editor.redo(), true);
    assert.deepEqual(Buffer.from(editor.save()), saved);
  } finally {
    editor.close();
  }
});

test('manual formula result reopened effective view agrees with persisted body', async () => {
  const editor = await createHwpxEditor(
    readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm'),
  );
  try {
    editor.open(readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx'));
    const source = editor.formulaSources(0)[0];
    editor.setManualFormulaResult(0, source.begin_element, '수동😀<&');
    const saved = Buffer.from(editor.save());
    editor.open(saved);
    assert.equal(editor.paragraphTextSnapshot(0)[23].text, '수동😀<&');
    assert.equal(editor.formulaSources(0)[0].values.last_result, source.values.last_result);
    assert.equal(editor.formulaCurrent(0)[0].values.last_result, '수동😀<&');
    assert.deepEqual(Buffer.from(editor.save()), saved);
  } finally {
    editor.close();
  }
});

test('manual formula result all thirteen protected chart ranges accept explicit result edits', async () => {
  const input = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx');
  const editor = await createHwpxEditor(
    readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm'),
  );
  try {
    editor.open(input);
    const fields = editor.formulaCurrent(0);
    assert.equal(fields.length, 13);
    for (const [ordinal, field] of fields.entries()) {
      editor.open(input);
      editor.enableHistory({ maxEntries: 4, maxCheckpointBytes: 4 * 1024 * 1024 });
      const display = `경로😀<&${field.values.last_result}`;
      editor.setManualFormulaResult(0, field.begin_element, display);
      const saved = Buffer.from(editor.save());
      for (const flags of [[], ['-O']])
        execFileSync('python3', [...flags, 'tools/hwpx-manual-result-save-oracle.py'], {
          input: JSON.stringify({
            before: input.toString('base64'),
            after: saved.toString('base64'),
            ordinal,
            display,
            selfTest: true,
          }),
          timeout: 30000,
        });
      assert.equal(editor.formulaCurrent(0)[ordinal].values.last_result, display);
      assert.equal(editor.undo(), true);
      assert.deepEqual(Buffer.from(editor.save()), input);
      assert.equal(editor.redo(), true);
      assert.deepEqual(Buffer.from(editor.save()), saved);
      editor.open(saved);
      assert.equal(editor.formulaCurrent(0)[ordinal].values.last_result, display);
      assert.deepEqual(Buffer.from(editor.save()), saved);
    }
  } finally {
    editor.close();
  }
});

test('manual formula result after a pending definition retains both definition and display', async () => {
  const editor = await createHwpxEditor(
    readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm'),
  );
  try {
    editor.open(readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx'));
    const field = editor.formulaSources(0)[0];
    editor.setFormulaDefinition(0, field.begin_element, '=AVG(B?:E?)');
    const definitionSaved = Buffer.from(editor.save());
    editor.enableHistory({ maxEntries: 8, maxCheckpointBytes: 4 * 1024 * 1024 });
    editor.setManualFormulaResult(0, field.begin_element, '수동');
    const saved = Buffer.from(editor.save());
    for (const flags of [[], ['-O']])
      execFileSync('python3', [...flags, 'tools/hwpx-manual-result-save-oracle.py'], {
        input: JSON.stringify({
          before: definitionSaved.toString('base64'),
          after: saved.toString('base64'),
          ordinal: 0,
          display: '수동',
          selfTest: true,
        }),
        timeout: 30000,
      });
    assert.equal(editor.undo(), true);
    assert.deepEqual(Buffer.from(editor.save()), definitionSaved);
    assert.equal(editor.redo(), true);
    assert.deepEqual(Buffer.from(editor.save()), saved);
    editor.open(saved);
    assert.equal(editor.formulaSources(0)[0].values.formula, '=AVG(B?:E?)');
    assert.equal(editor.formulaCurrent(0)[0].values.last_result, '수동');
    assert.deepEqual(Buffer.from(editor.save()), saved);
  } finally {
    editor.close();
  }
});

test('manual formula result reopened original definition requests automatic recalculation', async () => {
  const editor = await createHwpxEditor(
    readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm'),
  );
  try {
    editor.open(readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx'));
    const fields = editor.formulaSources(0);
    editor.setManualFormulaResult(0, fields[0].begin_element, '수동');
    editor.setManualFormulaResult(0, fields[1].begin_element, '다른 수동');
    editor.open(editor.save());
    editor.enableHistory({ maxEntries: 8, maxCheckpointBytes: 4 * 1024 * 1024 });
    const before = Buffer.from(editor.save());
    editor.setFormulaDefinition(0, fields[0].begin_element, fields[0].values.formula);
    const saved = Buffer.from(editor.save());
    assert.equal(editor.formulaCurrent(0)[0].values.last_result, '67.5');
    assert.equal(editor.formulaCurrent(0)[1].values.last_result, '다른 수동');
    assert.notDeepEqual(saved, before);
    assert.equal(editor.undo(), true);
    assert.deepEqual(Buffer.from(editor.save()), before);
    assert.equal(editor.redo(), true);
    assert.deepEqual(Buffer.from(editor.save()), saved);
  } finally {
    editor.close();
  }
});

test('manual formula result setting a reopened field preserves other source displays', async () => {
  const editor = await createHwpxEditor(
    readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm'),
  );
  try {
    editor.open(readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx'));
    const fields = editor.formulaSources(0);
    editor.setManualFormulaResult(0, fields[0].begin_element, '수동');
    editor.setManualFormulaResult(0, fields[1].begin_element, '다른 수동');
    editor.open(editor.save());
    editor.enableHistory({ maxEntries: 8, maxCheckpointBytes: 4 * 1024 * 1024 });
    const before = Buffer.from(editor.save());
    editor.setManualFormulaResult(0, fields[0].begin_element, '새 수동');
    const saved = Buffer.from(editor.save());
    assert.equal(editor.formulaCurrent(0)[0].values.last_result, '새 수동');
    assert.equal(editor.formulaCurrent(0)[1].values.last_result, '다른 수동');
    for (const flags of [[], ['-O']])
      execFileSync('python3', [...flags, 'tools/hwpx-manual-result-save-oracle.py'], {
        input: JSON.stringify({
          before: before.toString('base64'),
          after: saved.toString('base64'),
          ordinal: 0,
          display: '새 수동',
          selfTest: true,
        }),
        timeout: 30000,
      });
    assert.equal(editor.undo(), true);
    assert.deepEqual(Buffer.from(editor.save()), before);
    assert.equal(editor.redo(), true);
    assert.deepEqual(Buffer.from(editor.save()), saved);
  } finally {
    editor.close();
  }
});

test('manual formula result unrelated reopened display survives another formula input edit', async () => {
  const editor = await createHwpxEditor(
    readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm'),
  );
  try {
    editor.open(readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx'));
    const fields = editor.formulaSources(0);
    editor.setManualFormulaResult(0, fields[0].begin_element, '수동');
    editor.setManualFormulaResult(0, fields[1].begin_element, '다른 수동');
    editor.open(editor.save());
    assert.equal(editor.formulaCurrent(0)[1].values.last_result, '다른 수동');
    editor.enableHistory({ maxEntries: 8, maxCheckpointBytes: 4 * 1024 * 1024 });
    const before = Buffer.from(editor.save());
    editor.splice(0, 20, 0, 4, '12');
    const saved = Buffer.from(editor.save());
    assert.equal(editor.formulaCurrent(0)[0].values.last_result, '68.3');
    assert.equal(editor.formulaCurrent(0)[1].values.last_result, '다른 수동');
    for (const flags of [[], ['-O']])
      execFileSync('python3', [...flags, 'tools/hwpx-manual-result-save-oracle.py'], {
        input: JSON.stringify({
          before: before.toString('base64'),
          after: saved.toString('base64'),
          ordinal: 0,
          mode: 'recalculate',
          selfTest: true,
        }),
        timeout: 30000,
      });
    assert.equal(editor.undo(), true);
    assert.deepEqual(Buffer.from(editor.save()), before);
    assert.throws(() => editor.splice(0, 20, 0, 4, 'bad'), { message: 'InvalidFormulaNumber' });
    assert.equal(editor.redo(), true);
    assert.deepEqual(Buffer.from(editor.save()), saved);
    editor.splice(0, 20, 0, 2, '11.2');
    assert.equal(editor.formulaCurrent(0)[0].values.last_result, '67.5');
    assert.equal(editor.formulaCurrent(0)[1].values.last_result, '다른 수동');
    const restoredInput = Buffer.from(editor.save());
    editor.open(restoredInput);
    assert.equal(editor.formulaCurrent(0)[0].values.last_result, '67.5');
    assert.equal(editor.formulaCurrent(0)[1].values.last_result, '다른 수동');
    assert.deepEqual(Buffer.from(editor.save()), restoredInput);
  } finally {
    editor.close();
  }
});
