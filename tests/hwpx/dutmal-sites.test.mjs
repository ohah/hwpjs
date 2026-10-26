import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeDutmalSites } from '../../js/hwpx-dutmal-sites.mjs';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
import { execFileSync } from '../../tools/oracle-process.mjs';

test('dutmal sites reject coerced invalid and duplicate identities', () => {
  const decode = (value) => decodeDutmalSites(new TextEncoder().encode(JSON.stringify(value)));
  const row = { node: 7, paragraph: 26, anchor_unit: 43 };
  assert.deepEqual(decode([row]), [row]);
  assert.deepEqual(decode([]), []);
  for (const input of [
    {},
    [null],
    [row, row],
    [{ ...row, paragraph: 0 }],
    [{ ...row, node: '7' }],
    [{ ...row, anchor_unit: -1 }],
    [{ ...row, node: 0x100000000 }],
  ])
    assert.throws(() => decode(input), /InvalidHwpxDutmalSites/);
  assert.throws(() => decodeDutmalSites(new Uint8Array([255])), /InvalidHwpxDutmalSites/);
});

test('actual dutmal site moves with field text and survives independent history', async () => {
  assert(process.env.HWPJS_TEST_WASM, 'explicit dutmal sites candidate required');
  const input = readFileSync(
    'reference/rhwp/samples/hwpx/opengov/36389301_결재문서본문_직장훈련계획_덧말.hwpx',
  );
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM));
  try {
    editor.open(input);
    editor.enableHistory();
    const [site] = editor.dutmalSites(0);
    assert.equal(site.paragraph, 26);
    assert.equal(site.anchor_unit, 43);
    assert.deepEqual(Buffer.from(editor.save()), input);
    const field = editor.fieldLabels(0, 26)[0];
    editor.spliceFieldLabel(0, 26, field.beginElement, 0, 0, '앞😀');
    const moved = [{ ...site, anchor_unit: 46 }];
    assert.deepEqual(editor.dutmalSites(0), moved);
    const prefixSaved = Buffer.from(editor.save());
    editor.setDutmalText(0, site.node, 'mainText', '본문😀');
    assert.deepEqual(editor.dutmalSites(0), moved);
    const saved = Buffer.from(editor.save());
    for (const flags of [[], ['-O']])
      execFileSync('python3', [...flags, 'tools/hwpx-dutmal-text-oracle.py'], {
        input: JSON.stringify({
          before: prefixSaved.toString('base64'),
          after: saved.toString('base64'),
          mainText: '본문😀',
        }),
        timeout: 30000,
      });
    assert.equal(editor.undo(), true);
    assert.deepEqual(Buffer.from(editor.save()), prefixSaved);
    assert.deepEqual(editor.dutmalSites(0), moved);
    assert.equal(editor.undo(), true);
    assert.deepEqual(editor.dutmalSites(0), [site]);
    assert.throws(() => editor.dutmalSites(0xffffffff), /InvalidSectionIndex/);
    assert.equal(editor.redo(), true);
    assert.equal(editor.redo(), true);
    assert.deepEqual(Buffer.from(editor.save()), saved);
    editor.open(saved);
    const [reopened] = editor.dutmalSites(0);
    assert.equal(reopened.paragraph, 26);
    assert.equal(reopened.anchor_unit, 46);
    assert.equal(editor.dutmalText(0, reopened.node, 'mainText'), '본문😀');
  } finally {
    editor.close();
  }
});
