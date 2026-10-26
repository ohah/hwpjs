import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { workerCanvasHarness, dispatchCanvasEvent } from '../canvas/worker-harness.mjs';
import { layoutContent } from '../../web/preview/layout.mjs';
import { navigateText } from '../../web/preview/text-navigation.mjs';
import { adjacentOwnedParagraph } from '../../web/preview/paragraph-navigation.mjs';
import { execFileSync } from '../../tools/oracle-process.mjs';

test('HWPX Canvas owner-gap navigation preserves exact edit coordinates and complete saved XML', async (t) => {
  const input = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/table-bug.hwpx'),
    original = Buffer.from(input);
  const h = await workerCanvasHarness(t);
  assert.equal((await h.send({ kind: 'load', format: 'hwpx', bytes: input })).error, undefined);
  assert.equal((await h.send({ kind: 'enable' })).error, undefined);
  const end = h.renderer.paragraph({ section: 0, paragraph: 3 }).text.length;
  assert.equal(
    h.controller.selectTextRange({ section: 0, paragraph: 3, startUnit: end, endUnit: end }),
    true,
  );
  const count = h.requests.length;
  const adjacent = h.renderer.adjacentParagraph;
  h.renderer.adjacentParagraph = () => null;
  dispatchCanvasEvent(h.input, 'keydown', { key: 'ArrowRight' });
  assert.equal(h.canvas.dataset.caret, `0:3:${end}`);
  h.renderer.adjacentParagraph = adjacent;
  dispatchCanvasEvent(h.input, 'keydown', { key: 'ArrowRight' });
  assert.equal(h.canvas.dataset.caret, '0:72:0');
  dispatchCanvasEvent(h.input, 'keydown', { key: 'ArrowLeft' });
  assert.equal(h.canvas.dataset.caret, `0:3:${end}`);
  dispatchCanvasEvent(h.input, 'keydown', { key: 'ArrowRight', shiftKey: true });
  assert.equal(h.canvas.dataset.caret, `0:3:${end}`);
  dispatchCanvasEvent(h.input, 'keydown', { key: 'ArrowRight' });
  assert.equal(h.requests.length, count);
  assert.equal(h.input.value, '[붙임 2]');
  const marker = '본문이동😀<&';
  dispatchCanvasEvent(h.input, 'beforeinput', { inputType: 'insertText', data: marker });
  h.input.value = marker + h.input.value;
  h.input.setSelectionRange(marker.length, marker.length);
  dispatchCanvasEvent(h.input, 'input', { isComposing: false });
  assert.equal(h.requests.length, count + 1);
  assert.deepEqual(h.requests.at(-1), {
    kind: 'splice',
    origin: 'canvas',
    section: 0,
    paragraph: 72,
    startUnit: 0,
    endUnit: 0,
    text: marker,
  });
  assert.equal((await h.flush()).error, undefined);
  const saved = await h.send({ kind: 'save' });
  assert.equal(saved.error, undefined);
  const request = {
    before: input.toString('base64'),
    after: Buffer.from(saved.bytes).toString('base64'),
    section: 0,
    paragraph: 73,
    text: marker,
    mode: 'plain_text',
  };
  for (const flags of [[], ['-O']]) {
    const oracle = (value) =>
      execFileSync('python3', [...flags, 'tools/hwpx-anchor-prefix-oracle.py'], {
        input: JSON.stringify(value),
        timeout: 30000,
      });
    oracle(request);
    assert.throws(
      () => oracle({ ...request, paragraph: 74 }),
      'independent oracle must reject a wrong original paragraph',
    );
  }
  assert.equal(h.controller.history('undo'), true);
  assert.equal((await h.flush()).error, undefined);
  assert.deepEqual(Buffer.from((await h.send({ kind: 'save' })).bytes), original);
  assert.equal(h.controller.history('redo'), true);
  assert.equal((await h.flush()).error, undefined);
  assert.deepEqual(Buffer.from((await h.send({ kind: 'save' })).bytes), Buffer.from(saved.bytes));
  assert.equal(
    (await h.send({ kind: 'load', format: 'hwpx', bytes: saved.bytes })).error,
    undefined,
  );
  assert.equal((await h.send({ kind: 'enable' })).error, undefined);
  assert.equal(h.renderer.paragraph({ section: 0, paragraph: 72 }).text, marker + '[붙임 2]');
  assert.deepEqual(Buffer.from((await h.send({ kind: 'save' })).bytes), Buffer.from(saved.bytes));
  assert.deepEqual(input, original);
});

test('collapsed paragraph navigation skips nested owners but not clipped peers or section boundaries', () => {
  const paragraphs = [
    { section: 0, paragraph: 0, text: 'body', selectionOwner: 'section:0:body' },
    { section: 0, paragraph: 1, text: 'nested', selectionOwner: 'section:0:header' },
    { section: 0, paragraph: 2, text: 'next😀', selectionOwner: 'section:0:body' },
    { section: 1, paragraph: 0, text: 'other', selectionOwner: 'section:1:body' },
  ];
  const before = structuredClone(paragraphs),
    point = { section: 0, paragraph: 0, unit: 4 };
  assert.deepEqual(adjacentOwnedParagraph(paragraphs, point, true), {
    ...point,
    paragraph: 2,
    unit: 0,
    affinity: 'forward',
  });
  assert.equal(
    adjacentOwnedParagraph(paragraphs, { section: 0, paragraph: 2, unit: 0 }, false).unit,
    4,
  );
  assert.equal(
    adjacentOwnedParagraph(paragraphs, { section: 0, paragraph: 2, unit: 6 }, true),
    null,
  );
  assert.equal(
    adjacentOwnedParagraph(
      paragraphs.map((p) => (p.paragraph === 2 ? { ...p, clipped: true } : p)),
      point,
      true,
    ),
    null,
  );
  assert.equal(adjacentOwnedParagraph([...paragraphs, paragraphs[0]], point, true), null);
  assert.equal(adjacentOwnedParagraph(paragraphs, { ...point, createdCell: {} }, true), null);
  assert.deepEqual(paragraphs, before);
});

test('actual collapsed Canvas arrows cross nested source IDs without expanding selection permissions', async (t) => {
  const input = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/table-bug.hwp'),
    h = await workerCanvasHarness(t);
  assert.equal((await h.send({ kind: 'load', bytes: input })).error, undefined);
  assert.equal((await h.send({ kind: 'enable' })).error, undefined);
  for (const [from, to] of [
    [0, 2],
    [4, 73],
  ]) {
    const end = h.renderer.paragraph({ section: 0, paragraph: from }).text.length;
    const select = () =>
      assert.equal(
        h.controller.selectTextRange({ section: 0, paragraph: from, startUnit: end, endUnit: end }),
        true,
      );
    select();
    const requests = h.requests.length;
    dispatchCanvasEvent(h.input, 'keydown', { key: 'ArrowRight' });
    assert.equal(h.canvas.dataset.caret, `0:${to}:0`);
    dispatchCanvasEvent(h.input, 'keydown', { key: 'ArrowLeft' });
    assert.equal(h.canvas.dataset.caret, `0:${from}:${end}`);
    select();
    dispatchCanvasEvent(h.input, 'keydown', { key: 'ArrowRight', shiftKey: true });
    assert.equal(h.canvas.dataset.caret, `0:${from}:${end}`);
    assert.equal(h.requests.length, requests);
  }
  assert.deepEqual(Buffer.from((await h.send({ kind: 'save' })).bytes), input);
});

test('vertical candidate filtering precedes distance choice in both directions', () => {
  const layout = layoutContent(
    {
      paragraphs: [1, 2, 3, 4].map((paragraph) => ({
        section: 0,
        paragraph,
        text: 'abcd',
        label: '',
        editable: true,
      })),
      limited: false,
    },
    500,
    () => 8,
  );
  const before = structuredClone(layout);
  for (const [from, to, key] of [
    [1, 3, 'ArrowDown'],
    [3, 1, 'ArrowUp'],
  ]) {
    const point = { section: 0, paragraph: from, unit: 1 };
    const options = { extend: true, crossParagraph: true };
    assert.equal(navigateText(layout, 'abcd', point, point, key, options).focus.paragraph, 2);
    const checked = [];
    const next = navigateText(layout, 'abcd', point, point, key, {
      ...options,
      acceptRow: (row) => {
        checked.push(row.paragraph);
        return row.paragraph !== 2;
      },
    });
    assert.equal(next.focus.paragraph, to);
    assert.deepEqual(next.anchor, point);
    assert.equal(next.focus.unit, 1);
    if (key === 'ArrowDown')
      assert.equal(
        checked.includes(4),
        false,
        'do not query ownership farther than an accepted row',
      );
    assert.equal(
      navigateText(layout, 'abcd', point, point, key, { ...options, acceptRow: () => false }).focus
        .paragraph,
      from,
    );
  }
  assert.deepEqual(layout, before);
});

test('vertical Canvas navigation skips foreign owners before choosing an eligible row', async (t) => {
  const input = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/table-bug.hwp');
  const before = Buffer.from(input),
    h = await workerCanvasHarness(t);
  assert.equal((await h.send({ kind: 'load', bytes: input })).error, undefined);
  assert.equal((await h.send({ kind: 'enable' })).error, undefined);
  for (const [from, foreign, to] of [
    [13, 11, 14],
    [17, 16, 18],
    [208, 219, 209],
  ]) {
    const start = { section: 0, paragraph: from, unit: 0 };
    assert.equal(
      h.renderer.selectionRanges(start, { section: 0, paragraph: foreign, unit: 0 }),
      null,
    );
    assert(h.renderer.selectionRanges(start, { section: 0, paragraph: to, unit: 0 }));
    for (const shiftKey of [false, true]) {
      assert.equal(
        h.controller.selectTextRange({ section: 0, paragraph: from, startUnit: 0, endUnit: 0 }),
        true,
      );
      const count = h.requests.length;
      const event = dispatchCanvasEvent(h.input, 'keydown', { key: 'ArrowDown', shiftKey });
      assert.equal(event.defaultPrevented, true);
      const focus = h.canvas.dataset.caret.split(':').map(Number);
      assert.deepEqual(focus.slice(0, 2), [0, to], `from ${from}, shift ${shiftKey}`);
      assert.equal(h.requests.length, count, 'navigation must not mutate native state');
      if (shiftKey) {
        assert.equal(h.controller.selectedRange(), null);
        assert(
          h.renderer.selectionRanges(start, {
            section: focus[0],
            paragraph: focus[1],
            unit: focus[2],
          }),
        );
      }
    }
  }
  assert.deepEqual(Buffer.from((await h.send({ kind: 'save' })).bytes), before);
  assert.deepEqual(input, before);
});
