import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
import { execFileSync } from '../../tools/oracle-process.mjs';

test('actual dependent formula permits display-only edit without calculating through manual text', async () => {
  const input = readFileSync('reference/rhwp/samples/issue5543_carried_anchor_ladder.hwpx');
  const editor = await createHwpxEditor(
    readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm'),
  );
  try {
    editor.open(input);
    editor.enableHistory({ maxEntries: 8, maxCheckpointBytes: 16 * 1024 * 1024 });
    const sources = editor.formulaSources(0),
      current = editor.formulaCurrent(0);
    assert.equal(sources.length, 14);
    const display = '표시만😀<&';
    editor.setManualFormulaResult(0, sources[0].begin_element, display);
    const saved = Buffer.from(editor.save()),
      revision = editor.historyRevision();
    assert.deepEqual(editor.formulaSources(0), sources);
    const after = editor.formulaCurrent(0);
    assert.equal(after[0].values.last_result, display);
    assert.deepEqual(
      after.slice(1),
      current.slice(1),
      'UnchangedDependentDisplayOrCacheRecalculated',
    );
    for (const flags of [[], ['-O']])
      execFileSync('python3', [...flags, 'tools/hwpx-manual-result-save-oracle.py'], {
        input: JSON.stringify({
          before: input.toString('base64'),
          after: saved.toString('base64'),
          ordinal: 0,
          display,
          selfTest: true,
        }),
        timeout: 30000,
      });
    // This is a real calculation request, not a source-display save.
    assert.throws(() => editor.setFormulaDefinition(0, sources[1].begin_element, '=AVG(E?:F?)'), {
      message: 'UnsupportedFormulaResultDependency',
    });
    assert.equal(editor.historyRevision(), revision);
    assert.deepEqual(Buffer.from(editor.save()), saved);
    assert.equal(editor.undo(), true);
    assert.deepEqual(Buffer.from(editor.save()), input);
    assert.equal(editor.redo(), true);
    assert.deepEqual(Buffer.from(editor.save()), saved);
    editor.open(saved);
    assert.equal(editor.formulaCurrent(0)[0].values.last_result, display);
    assert.deepEqual(Buffer.from(editor.save()), saved);
  } finally {
    editor.close();
  }
});
