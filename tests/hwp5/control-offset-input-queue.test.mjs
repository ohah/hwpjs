import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { workerCanvasHarness, dispatchCanvasEvent } from '../canvas/worker-harness.mjs';
import {
  inspect,
  expectedSection,
  paragraphRecords,
  records,
} from './style-preservation/text-record-oracle.mjs';
import { controlLinkEvidence } from './links.mjs';

test('queued input around actual form anchors preserves both observed version profiles', async (t) => {
  assert(process.env.HWPJS_TEST_WASM, 'explicit candidate required');
  const h = await workerCanvasHarness(t);
  for (const [name, version, forms] of [
    ['form-01.hwp', 0x05000300, 5],
    ['hwpx/hancom-hwp/form-002.hwp', 0x05010001, 180],
  ]) {
    const input = readFileSync(`reference/rhwp/samples/${name}`),
      before = inspect(input),
      section = before.sections[0].bytes;
    assert.equal(before.streams.get('FileHeader').readUInt32LE(32), version);
    const all = records(section),
      heads = all.map((row, index) => (row.tag === 66 ? index : -1)).filter((index) => index >= 0);
    assert.equal(all.filter((row) => row.tag === 91).length, forms);
    const form = controlLinkEvidence(section).find((row) => row[6] === 0x666f726d);
    assert(form);
    assert.equal(form[4], 11);
    const paragraph = heads.indexOf(form[0]),
      sourceStart = form[3];
    assert(paragraph >= 0);
    const owner = paragraphRecords(section, paragraph),
      textRecord = owner.direct.find((row) => row.tag === 67 && row.level === owner.head.level + 1);
    let displayStart = 0;
    for (let unit = 0; unit < sourceStart; displayStart++) {
      const code = textRecord.payload.readUInt16LE(unit * 2);
      unit += code >= 1 && code <= 23 && code !== 10 && code !== 13 ? 8 : 1;
      assert(unit <= sourceStart, 'oracle must stop at the form boundary');
    }
    assert.equal(textRecord.payload.readUInt16LE(sourceStart * 2), 11);
    const loaded = await h.send({ kind: 'load', format: 'hwp5', bytes: input });
    assert.equal(loaded.error, undefined);
    assert.equal((await h.send({ kind: 'enable' })).error, undefined);
    const original = loaded.content.paragraphs.find(
      (row) => row.section === 0 && row.paragraph === paragraph,
    );
    assert(original?.editable);
    assert.equal(original.text[displayStart], '\ufffc');
    assert.equal(
      h.controller.selectTextRange({
        section: 0,
        paragraph,
        startUnit: displayStart + 1,
        endUnit: displayStart + 1,
      }),
      true,
    );
    const start = h.requests.length;
    let draft = original.text;
    const steps = [
      { display: displayStart + 1, source: sourceStart + 8, text: '😀' },
      { display: 0, source: 0, text: '앞' },
      { display: displayStart + 2, source: sourceStart + 9, text: '가' },
    ];
    for (const step of steps) {
      h.input.setSelectionRange(step.display, step.display);
      assert.equal(
        dispatchCanvasEvent(h.input, 'beforeinput', { inputType: 'insertText', data: step.text })
          .defaultPrevented,
        false,
      );
      draft = draft.slice(0, step.display) + step.text + draft.slice(step.display);
      step.after = draft;
      h.input.value = draft;
      h.input.setSelectionRange(step.display + step.text.length, step.display + step.text.length);
      dispatchCanvasEvent(h.input, 'input');
    }
    for (const step of steps) assert.equal((await h.flush()).error, undefined, step.after);
    assert.deepEqual(
      h.requests.slice(start),
      steps.map((step) => ({
        kind: 'splice',
        origin: 'canvas',
        section: 0,
        paragraph,
        startUnit: step.source,
        endUnit: step.source,
        text: step.text,
      })),
    );
    const savedReply = await h.send({ kind: 'save', allowStaleLayout: true });
    assert.equal(savedReply.error, undefined);
    const after = inspect(savedReply.bytes);
    let expected = section;
    for (const step of steps)
      expected = expectedSection(expected, paragraph, step.source, step.source, step.text, {
        fieldIds: [0x25636c6b],
      });
    assert.deepEqual(after.sections[0].bytes, expected, name);
    const formRecords = (rows) =>
      rows
        .filter(
          (row) => row.tag === 91 || (row.tag === 71 && row.payload.readUInt32LE(0) === 0x666f726d),
        )
        .map((row) => row.raw);
    assert.deepEqual(formRecords(records(after.sections[0].bytes)), formRecords(all));
    let wrong = section;
    for (const step of steps)
      wrong = expectedSection(
        wrong,
        paragraph,
        step.source,
        step.source,
        step.text === '가' ? '나' : step.text,
        { fieldIds: [0x25636c6b] },
      );
    assert.throws(() => assert.deepEqual(after.sections[0].bytes, wrong), {
      name: 'AssertionError',
    });
    assert.deepEqual(after.metadata, before.metadata);
    for (const [path, bytes] of before.streams)
      if (path !== before.sections[0].path) assert.deepEqual(after.streams.get(path), bytes, path);
    for (let index = steps.length - 1; index >= 0; index--) {
      assert.equal(h.controller.history('undo'), true);
      assert.equal((await h.flush()).error, undefined);
      assert.equal(h.input.value, index === 0 ? original.text : steps[index - 1].after);
    }
    assert.deepEqual(Buffer.from((await h.send({ kind: 'save' })).bytes), input);
    for (const step of steps) {
      assert.equal(h.controller.history('redo'), true);
      assert.equal((await h.flush()).error, undefined);
      assert.equal(h.input.value, step.after);
    }
    assert.deepEqual(
      (await h.send({ kind: 'save', allowStaleLayout: true })).bytes,
      savedReply.bytes,
    );
    const reopened = await h.send({ kind: 'load', format: 'hwp5', bytes: savedReply.bytes });
    assert.equal(reopened.error, undefined);
    assert.equal(
      reopened.content.paragraphs.find((row) => row.section === 0 && row.paragraph === paragraph)
        .text,
      draft,
    );
  }
});

test('pending input remaps visible positions after an eight-unit HWP5 tab without modifying its payload', async (t) => {
  assert(process.env.HWPJS_TEST_WASM, 'explicit candidate required');
  const input = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/software.hwp'),
    before = inspect(input);
  const owner = paragraphRecords(before.sections[0].bytes, 33);
  const textRecord = owner.direct.find(
    (row) => row.tag === 67 && row.level === owner.head.level + 1,
  );
  assert.equal(textRecord.payload.readUInt16LE(0), 9);
  assert.equal(textRecord.payload.readUInt16LE(14), 9);
  assert.equal(textRecord.payload.subarray(16).toString('utf16le'), '- \r');
  const h = await workerCanvasHarness(t);
  const loaded = await h.send({ kind: 'load', format: 'hwp5', bytes: input });
  assert.equal(loaded.error, undefined);
  assert.equal((await h.send({ kind: 'enable' })).error, undefined);
  const paragraph = loaded.content.paragraphs.find(
    (row) => row.section === 0 && row.paragraph === 33,
  );
  assert.equal(paragraph.text, '\t- ');
  assert.equal(paragraph.editable, true);
  assert.equal(
    h.controller.selectTextRange({ section: 0, paragraph: 33, startUnit: 1, endUnit: 1 }),
    true,
  );
  const start = h.requests.length;
  // Independent raw evidence above establishes the eight-unit token. Expected
  // source positions below are not obtained from the product's sourceOffsets.
  const steps = [
    { display: 1, source: 8, text: '😀', after: '\t😀- ' },
    { display: 0, source: 0, text: '앞', after: '앞\t😀- ' },
    { display: 2, source: 9, text: '가', after: '앞\t가😀- ' },
  ];
  for (const step of steps) {
    h.input.setSelectionRange(step.display, step.display);
    assert.equal(
      dispatchCanvasEvent(h.input, 'beforeinput', { inputType: 'insertText', data: step.text })
        .defaultPrevented,
      false,
    );
    h.input.value = step.after;
    h.input.setSelectionRange(step.display + step.text.length, step.display + step.text.length);
    dispatchCanvasEvent(h.input, 'input');
  }
  assert.equal(h.requests.length, start + 1);
  for (const step of steps) assert.equal((await h.flush()).error, undefined, step.after);
  assert.deepEqual(
    h.requests.slice(start),
    steps.map((step) => ({
      kind: 'splice',
      origin: 'canvas',
      section: 0,
      paragraph: 33,
      startUnit: step.source,
      endUnit: step.source,
      text: step.text,
    })),
  );
  const savedReply = await h.send({ kind: 'save', allowStaleLayout: true });
  assert.equal(savedReply.error, undefined);
  const saved = savedReply.bytes,
    after = inspect(saved);
  let expected = before.sections[0].bytes;
  for (const step of steps)
    expected = expectedSection(expected, 33, step.source, step.source, step.text);
  assert.deepEqual(after.sections[0].bytes, expected);
  let wrong = before.sections[0].bytes;
  for (const step of steps)
    wrong = expectedSection(
      wrong,
      33,
      step.source,
      step.source,
      step.text === '가' ? '나' : step.text,
    );
  assert.throws(() => assert.deepEqual(after.sections[0].bytes, wrong), { name: 'AssertionError' });
  const finalOwner = paragraphRecords(after.sections[0].bytes, 33);
  const finalText = finalOwner.direct.find(
    (row) => row.tag === 67 && row.level === finalOwner.head.level + 1,
  ).payload;
  assert.deepEqual(finalText.subarray(2, 18), textRecord.payload.subarray(0, 16));
  assert.deepEqual(after.metadata, before.metadata);
  for (const [path, bytes] of before.streams)
    if (path !== before.sections[0].path) assert.deepEqual(after.streams.get(path), bytes, path);
  for (let index = steps.length - 1; index >= 0; index--) {
    assert.equal(h.controller.history('undo'), true);
    assert.equal((await h.flush()).error, undefined);
    assert.equal(h.input.value, index === 0 ? paragraph.text : steps[index - 1].after);
    assert.equal(h.input.selectionStart, steps[index].display);
  }
  assert.deepEqual(Buffer.from((await h.send({ kind: 'save' })).bytes), input);
  for (const step of steps) {
    assert.equal(h.controller.history('redo'), true);
    assert.equal((await h.flush()).error, undefined);
    assert.equal(h.input.value, step.after);
  }
  assert.deepEqual((await h.send({ kind: 'save', allowStaleLayout: true })).bytes, saved);
  const reopened = await h.send({ kind: 'load', format: 'hwp5', bytes: saved });
  assert.equal(reopened.error, undefined);
  assert.equal(
    reopened.content.paragraphs.find((row) => row.section === 0 && row.paragraph === 33).text,
    steps.at(-1).after,
  );
  t.diagnostic(
    'original tab payload, full Section, non-target CFB streams and native history; simulated DOM, not browser or layout proof',
  );
});
