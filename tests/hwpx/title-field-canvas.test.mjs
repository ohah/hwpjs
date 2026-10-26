import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { workerCanvasHarness, dispatchCanvasEvent } from '../canvas/worker-harness.mjs';
import { execFileSync } from '../../tools/oracle-process.mjs';

test('actual title BOOKMARK accepts Canvas input without exposing whole paragraph editing', async (t) => {
  assert(process.env.HWPJS_TEST_WASM, 'ExplicitTitleFieldCandidateRequired');
  const input = readFileSync('reference/rhwp/samples/추진일정.hwpx'),
    h = await workerCanvasHarness(t);
  assert.equal((await h.send({ kind: 'load', format: 'hwpx', bytes: input })).error, undefined);
  const enabled = await h.send({ kind: 'enable' });
  assert.equal(enabled.error, undefined);
  const row = enabled.content.paragraphs.find((p) => p.section === 0 && p.paragraph === 0);
  assert(row);
  assert.equal(row.fieldLabels.length, 1);
  assert.equal(row.plainEditable, false);
  assert.equal(row.editable, true);
  const permission = await h.send({
    kind: 'query-edit-range',
    requestId: 1,
    section: 0,
    paragraph: 0,
    startUnit: 0,
    endUnit: 0,
  });
  assert.equal(permission.error, undefined);
  assert.equal(permission.allowed, true);
  assert.equal(
    h.controller.selectTextRange({ section: 0, paragraph: 0, startUnit: 0, endUnit: 0 }),
    true,
  );
  const marker = '화면제목😀<&';
  dispatchCanvasEvent(h.input, 'beforeinput', {
    inputType: 'insertText',
    data: marker,
    isComposing: false,
  });
  h.input.value = marker + row.text;
  h.input.setSelectionRange(marker.length, marker.length);
  dispatchCanvasEvent(h.input, 'input');
  assert.equal((await h.flush()).error, undefined);
  assert.equal(h.requests.at(-1).kind, 'splice');
  const saved = Buffer.from((await h.send({ kind: 'save' })).bytes);
  const request = {
    before: input.toString('base64'),
    after: saved.toString('base64'),
    section: 0,
    paragraph: 1,
    beginId: '1126376209',
    text: marker,
  };
  for (const flags of [[], ['-O']])
    execFileSync('python3', [...flags, 'tools/title-field-oracle.py'], {
      input: JSON.stringify(request),
      timeout: 30000,
    });
  assert.equal(h.controller.history('undo'), true);
  assert.equal((await h.flush()).error, undefined);
  assert.deepEqual(Buffer.from((await h.send({ kind: 'save' })).bytes), input);
  assert.equal(h.controller.history('redo'), true);
  assert.equal((await h.flush()).error, undefined);
  assert.deepEqual(Buffer.from((await h.send({ kind: 'save' })).bytes), saved);
  const loaded = await h.send({ kind: 'load', format: 'hwpx', bytes: saved });
  assert.equal(loaded.error, undefined);
  assert.equal(
    loaded.content.paragraphs.find((p) => p.section === 0 && p.paragraph === 0).text,
    marker + row.text,
  );
  assert.deepEqual(Buffer.from((await h.send({ kind: 'save' })).bytes), saved);
});

test("title metadata refusals stay read-only in Canvas and retain another paragraph's redo", async (t) => {
  assert(process.env.HWPJS_TEST_WASM, 'ExplicitTitleFieldCandidateRequired');
  const input = readFileSync('reference/rhwp/samples/추진일정.hwpx'),
    h = await workerCanvasHarness(t);
  for (const mode of [
    'unknown-field',
    'unknown-control',
    'malformed-title',
    'unknown-run-control',
  ]) {
    const source = Buffer.from(
      execFileSync('python3', ['tools/title-field-mutate.py'], {
        input: JSON.stringify({ before: input.toString('base64'), mode }),
        encoding: 'utf8',
        timeout: 30000,
      }).trim(),
      'base64',
    );
    assert.equal(
      (await h.send({ kind: 'load', format: 'hwpx', bytes: source })).error,
      undefined,
      mode,
    );
    const enabled = await h.send({ kind: 'enable' });
    assert.equal(enabled.error, undefined, mode);
    const row = enabled.content.paragraphs.find((p) => p.section === 0 && p.paragraph === 0);
    assert(row);
    assert.deepEqual(row.fieldLabels, [], mode);
    assert.equal(row.editable, false, mode);
    const permission = await h.send({
      kind: 'query-edit-range',
      requestId: 1,
      section: 0,
      paragraph: 0,
      startUnit: 0,
      endUnit: 0,
    });
    assert.equal(permission.allowed, false, mode);
    const seed = enabled.content.paragraphs.find((p) => p.plainEditable && p.paragraph !== 0);
    assert(seed);
    assert.equal(
      (
        await h.send({
          kind: 'splice',
          section: seed.section,
          paragraph: seed.paragraph,
          startUnit: 0,
          endUnit: 0,
          text: 'seed',
        })
      ).error,
      undefined,
    );
    const saved = Buffer.from((await h.send({ kind: 'save' })).bytes);
    assert.equal((await h.send({ kind: 'undo' })).changed, true);
    const refused = await h.send({
      kind: 'splice',
      section: 0,
      paragraph: 0,
      startUnit: 0,
      endUnit: 0,
      text: 'blocked',
    });
    assert.match(refused.error, /Unsupported|Protected/, mode);
    assert.deepEqual(Buffer.from((await h.send({ kind: 'save' })).bytes), source, mode);
    assert.equal((await h.send({ kind: 'redo' })).changed, true, mode);
    assert.deepEqual(Buffer.from((await h.send({ kind: 'save' })).bytes), saved, mode);
  }
});
