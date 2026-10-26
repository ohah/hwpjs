import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { workerCanvasHarness, dispatchCanvasEvent } from '../canvas/worker-harness.mjs';
import { execFileSync } from '../../tools/oracle-process.mjs';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';

test('Canvas metadata-only host input preserves page numbering header and footer settings', async (t) => {
  assert(process.env.HWPJS_TEST_WASM, 'explicit source affinity candidate required');
  const input = readFileSync('reference/rhwp/samples/issue6179/right_tab_footer_logo.hwpx');
  const h = await workerCanvasHarness(t);
  const loaded = await h.send({ kind: 'load', format: 'hwpx', bytes: input });
  assert.equal(loaded.error, undefined);
  const row = loaded.content.paragraphs.find((p) => p.section === 0 && p.paragraph === 0);
  assert(row);
  assert.equal(row.text, '');
  assert.equal(row.plainEditable, true);
  assert.equal((await h.send({ kind: 'enable' })).error, undefined);
  assert.equal(
    h.controller.selectTextRange({ section: 0, paragraph: 0, startUnit: 0, endUnit: 0 }),
    true,
  );
  const text = '본문😀<&';
  dispatchCanvasEvent(h.input, 'beforeinput', {
    inputType: 'insertText',
    data: text,
    isComposing: false,
  });
  h.input.value = text;
  h.input.setSelectionRange(text.length, text.length);
  dispatchCanvasEvent(h.input, 'input');
  const changed = await h.flush();
  assert.equal(changed.error, undefined);
  assert.equal(
    changed.content.paragraphs.find((p) => p.section === 0 && p.paragraph === 0).text,
    text,
  );
  const saved = Buffer.from((await h.send({ kind: 'save' })).bytes);
  for (const flags of [[], ['-O']])
    execFileSync('python3', [...flags, 'tools/hwpx-anchor-prefix-oracle.py'], {
      input: JSON.stringify({
        before: input.toString('base64'),
        after: saved.toString('base64'),
        section: 0,
        paragraph: 1,
        text,
        mode: 'metadata_run',
      }),
      timeout: 30000,
    });
  assert.equal((await h.send({ kind: 'undo' })).error, undefined);
  assert.deepEqual(Buffer.from((await h.send({ kind: 'save' })).bytes), input);
  assert.equal((await h.send({ kind: 'redo' })).error, undefined);
  assert.deepEqual(Buffer.from((await h.send({ kind: 'save' })).bytes), saved);
  const resized = await h.send({
    kind: 'character-properties',
    origin: 'canvas',
    section: 0,
    paragraph: 0,
    startUnit: 0,
    endUnit: text.length,
    properties: { size: 1200 },
  });
  assert.equal(resized.error, undefined);
  assert.equal(
    resized.content.paragraphs.find((p) => p.section === 0 && p.paragraph === 0).text,
    text,
  );
  const resizedSaved = Buffer.from((await h.send({ kind: 'save' })).bytes);
  assert.notDeepEqual(resizedSaved, saved);
  const propertyRequest = {
    before: saved.toString('base64'),
    after: resizedSaved.toString('base64'),
    mode: 'anchor-properties',
    section: 0,
    localParagraph: 0,
    startUnit: 0,
    endUnit: text.length,
    properties: { size: 1200 },
  };
  for (const flags of [[], ['-O']]) {
    const verify = (request) =>
      JSON.parse(
        execFileSync('python3', [...flags, 'tools/hwpx-character-property-oracle.py'], {
          input: JSON.stringify(request),
          encoding: 'utf8',
          timeout: 30000,
        }),
      );
    assert.equal(verify(propertyRequest).verified, true);
    assert.throws(
      () => verify({ ...propertyRequest, after: propertyRequest.before }),
      /mismatch|differs/,
    );
  }
  const reopened = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM));
  try {
    reopened.open(resizedSaved);
    const shapes = new Map(reopened.characterShapes().map((shape) => [shape.id, shape]));
    const ranges = reopened.characterRanges(0, 1);
    assert(ranges.length > 0);
    assert.equal(ranges[0].start, 0);
    assert.equal(ranges.at(-1).end, text.length);
    for (const range of ranges) assert.equal(shapes.get(range.charShapeId).height, 1200);
  } finally {
    reopened.close();
  }
  assert.equal((await h.send({ kind: 'undo' })).error, undefined);
  assert.deepEqual(Buffer.from((await h.send({ kind: 'save' })).bytes), saved);
  assert.equal((await h.send({ kind: 'redo' })).error, undefined);
  assert.deepEqual(Buffer.from((await h.send({ kind: 'save' })).bytes), resizedSaved);
});
