import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanvasEditor } from '../../web/preview/canvas-editor.mjs';
import { layoutContent } from '../../web/preview/layout.mjs';

// Event ordering only: these events are synthetic, and the ACK is a controlled
// host reply. This fixture neither executes Native nor proves OS IME behavior.
function fixture(t, { scopedPermission = false } = {}) {
  const document = { activeElement: null };
  const editQueries = [],
    splitQueries = [];
  class Element extends EventTarget {
    style = {};
    dataset = {};
    value = '';
    selectionStart = 0;
    selectionEnd = 0;
    selectionDirection = 'forward';
    scrollTop = 0;
    scrollLeft = 0;
    clientHeight = 300;
    clientWidth = 440;
    setAttribute() {}
    scrollIntoView() {}
    setPointerCapture() {}
    hasPointerCapture() {
      return false;
    }
    releasePointerCapture() {}
    getBoundingClientRect() {
      return { top: 0, left: 0, bottom: 300, width: 440, height: 300 };
    }
    setSelectionRange(start, end, direction = 'forward') {
      this.selectionStart = start;
      this.selectionEnd = end;
      this.selectionDirection = direction;
    }
    focus() {
      document.activeElement = this;
    }
    blur() {
      document.activeElement = null;
    }
  }
  const input = new Element(),
    canvas = new Element(),
    viewport = new Element(),
    note = { textContent: '' },
    requests = [],
    trace = [];
  let rows = [
      { section: 0, paragraph: 1, text: '보도일시', editable: !scopedPermission, selectable: true },
    ],
    layout,
    busy = false;
  const reflow = (draft) => {
    layout = layoutContent(
      {
        format: 'hwpx',
        limited: false,
        paragraphs: rows.map((row) =>
          draft && row.paragraph === draft.paragraph ? { ...row, text: draft.text } : row,
        ),
      },
      400,
      () => 10,
    );
  };
  reflow();
  const renderer = {
    layout: () => layout,
    paragraph: (point) =>
      rows.find((row) => row.section === point.section && row.paragraph === point.paragraph),
    preview: reflow,
    select() {},
    onGeometry() {},
  };
  const controller = createCanvasEditor({
    canvas,
    input,
    viewport,
    renderer,
    note,
    ...(scopedPermission
      ? {
          queryEditRange: (request) => editQueries.push(request),
          querySplitRange: (request) => splitQueries.push(request),
        }
      : {}),
    environment: { ownerDocument: document, activeElement: () => document.activeElement },
    controls: {
      ready: () => true,
      busy: () => busy,
      request: (request) => {
        assert.equal(busy, false);
        requests.push(request);
        trace.push(request.kind);
        busy = true;
        return true;
      },
    },
  });
  t.after(() => controller.close());
  controller.message({
    kind: 'enable',
    structureAvailable: true,
    splitQueryAvailable: scopedPermission,
  });
  assert.equal(
    controller.selectTextRange({ section: 0, paragraph: 1, startUnit: 2, endUnit: 2 }),
    true,
  );
  if (scopedPermission) {
    assert.ok(editQueries.length);
    controller.message({ ...editQueries.at(-1), allowed: true });
  }
  assert.equal(input.readOnly, false);
  const event = (type, fields = {}) => {
    const value = new Event(type, { cancelable: true });
    Object.assign(value, fields);
    input.dispatchEvent(value);
    return value;
  };
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  const compose = () => {
    event('compositionstart');
    input.value = '보도한일시';
    input.setSelectionRange(3, 3);
    event('input', { inputType: 'insertCompositionText', isComposing: true, data: '한' });
    assert.equal(requests.length, 0);
  };
  const end = async (data = '한') => {
    event('compositionend', { data });
    await tick();
  };
  const ack = async (error) => {
    const request = requests.at(-1);
    assert.equal(request.kind, 'splice');
    trace.push('ack');
    if (!error) {
      rows = rows.map((row) =>
        row.paragraph === request.paragraph
          ? {
              ...row,
              text:
                row.text.slice(0, request.startUnit) +
                request.text +
                row.text.slice(request.endUnit),
            }
          : row,
      );
    }
    busy = false;
    reflow();
    controller.message({ kind: 'splice', origin: 'canvas', ...(error ? { error } : {}) });
    await tick();
  };
  const ackSplit = async () => {
    const request = requests.at(-1);
    assert.equal(request.kind, 'split');
    const row = rows.find((value) => value.paragraph === request.paragraph);
    rows = rows.flatMap((value) =>
      value === row
        ? [
            { ...row, text: row.text.slice(0, request.atUnit) },
            { ...row, paragraph: row.paragraph + 1, text: row.text.slice(request.endUnit) },
          ]
        : [
            {
              ...value,
              paragraph: value.paragraph > row.paragraph ? value.paragraph + 1 : value.paragraph,
            },
          ],
    );
    busy = false;
    reflow();
    controller.message({
      kind: 'split',
      origin: 'canvas',
      splitTarget: { section: 0, paragraph: row.paragraph + 1 },
    });
    await tick();
  };
  return {
    input,
    event,
    requests,
    trace,
    controller,
    compose,
    end,
    ack,
    ackSplit,
    tick,
    note,
    rows: () => rows,
    editQueries,
    splitQueries,
  };
}
for (const inputType of ['insertLineBreak', 'insertParagraph'])
  for (const isComposing of [false, true])
    test(`composition newline ${inputType}/${isComposing} waits for text ACK before one split`, async (t) => {
      const h = fixture(t);
      h.compose();
      h.event('keydown', { key: 'Enter', isComposing: true, keyCode: 229 });
      assert.equal(h.event('beforeinput', { inputType, isComposing }).defaultPrevented, true);
      assert.equal(h.requests.length, 0);
      await h.end();
      assert.deepEqual(h.trace, ['splice']);
      assert.deepEqual(h.requests[0], {
        kind: 'splice',
        origin: 'canvas',
        section: 0,
        paragraph: 1,
        startUnit: 2,
        endUnit: 2,
        text: '한',
      });
      await h.ack();
      assert.deepEqual(h.trace, ['splice', 'ack', 'split']);
      assert.equal(h.requests[1].atUnit, 3);
      assert.equal(h.requests[1].endUnit, 3);
      assert.equal(h.rows()[0].text, '보도한일시');
    });
test('IME confirmation Enter alone never guesses a split without beforeinput newline', async (t) => {
  const h = fixture(t);
  h.compose();
  h.event('keydown', { key: 'Enter', isComposing: true, keyCode: 229 });
  await h.end();
  await h.ack();
  assert.deepEqual(h.trace, ['splice', 'ack']);
});
test('reset during composition clears queued newline and ignores stale compositionend', async (t) => {
  const h = fixture(t);
  h.compose();
  h.event('beforeinput', { inputType: 'insertLineBreak', isComposing: false });
  h.controller.reset();
  await h.end();
  assert.deepEqual(h.requests, []);
  h.controller.message({ kind: 'enable', structureAvailable: true });
  assert.equal(
    h.controller.selectTextRange({ section: 0, paragraph: 1, startUnit: 2, endUnit: 2 }),
    true,
  );
  await h.tick();
  assert.deepEqual(h.requests, []);
  assert.equal(h.input.value, '보도일시');
});
test('rejected composed-text ACK cancels queued newline and restores original selection', async (t) => {
  const h = fixture(t);
  h.compose();
  h.event('beforeinput', { inputType: 'insertParagraph', isComposing: false });
  await h.end();
  assert.deepEqual(h.trace, ['splice']);
  await h.ack('RejectedTextEdit');
  assert.deepEqual(h.trace, ['splice', 'ack']);
  assert.equal(h.input.value, '보도일시');
  assert.equal(h.rows()[0].text, '보도일시');
  assert.equal(h.controller.currentFormattingSelection().focus.unit, 2);
});
test('closing during composition discards queued newline and detached events have no requests', async (t) => {
  const h = fixture(t);
  h.compose();
  h.event('beforeinput', { inputType: 'insertLineBreak', isComposing: false });
  h.controller.close();
  await h.end();
  assert.deepEqual(h.requests, []);
});
test('normal Enter after compositionend and text ACK has one split despite following beforeinput', async (t) => {
  const h = fixture(t);
  h.compose();
  await h.end();
  await h.ack();
  assert.deepEqual(h.trace, ['splice', 'ack']);
  h.event('keydown', { key: 'Enter', isComposing: false, keyCode: 13 });
  assert.equal(
    h.event('beforeinput', { inputType: 'insertParagraph', isComposing: false }).defaultPrevented,
    true,
  );
  assert.equal(h.requests.filter((value) => value.kind === 'split').length, 1);
  await h.ackSplit();
  assert.equal(h.requests.filter((value) => value.kind === 'split').length, 1);
  assert.deepEqual(
    h.rows().map((value) => value.text),
    ['보도한', '일시'],
  );
  assert.equal(h.controller.currentFormattingSelection().focus.paragraph, 2);
});
test('queued newline is consumed once across splice ACK and split ACK', async (t) => {
  const h = fixture(t);
  h.compose();
  h.event('beforeinput', { inputType: 'insertLineBreak', isComposing: false });
  await h.end();
  await h.ack();
  assert.equal(h.requests.filter((value) => value.kind === 'split').length, 1);
  await h.ackSplit();
  await h.tick();
  assert.equal(h.requests.filter((value) => value.kind === 'split').length, 1);
  assert.deepEqual(
    h.rows().map((value) => value.text),
    ['보도한', '일시'],
  );
});
for (const kind of ['beforeinput', 'keydown'])
  test(`compositionend then ${kind} newline before text ACK preserves the intent`, async (t) => {
    const h = fixture(t);
    h.compose();
    await h.end();
    assert.deepEqual(h.trace, ['splice']);
    const event =
      kind === 'beforeinput'
        ? h.event(kind, { inputType: 'insertParagraph', isComposing: false })
        : h.event(kind, { key: 'Enter', keyCode: 13, isComposing: false });
    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(h.trace, ['splice']);
    await h.ack();
    assert.deepEqual(h.trace, ['splice', 'ack', 'split']);
    assert.equal(h.requests[1].atUnit, 3);
    await h.ackSplit();
    assert.deepEqual(
      h.rows().map((value) => value.text),
      ['보도한', '일시'],
    );
  });
test('two explicit newline intents remain two splits rather than speculative deduplication', async (t) => {
  const h = fixture(t);
  h.compose();
  h.event('beforeinput', { inputType: 'insertParagraph', isComposing: false });
  h.event('beforeinput', { inputType: 'insertParagraph', isComposing: false });
  await h.end();
  await h.ack();
  assert.equal(h.requests.filter((value) => value.kind === 'split').length, 1);
  await h.ackSplit();
  assert.equal(h.requests.filter((value) => value.kind === 'split').length, 2);
  await h.ackSplit();
  assert.equal(h.requests.filter((value) => value.kind === 'split').length, 2);
  assert.deepEqual(
    h.rows().map((value) => value.text),
    ['보도한', '', '일시'],
  );
});
test('denied composition range cannot revive its queued newline after a later split permission wake', async (t) => {
  const h = fixture(t, { scopedPermission: true });
  h.event('compositionstart');
  h.input.value = '보한일시';
  h.input.setSelectionRange(2, 2);
  h.event('input', { inputType: 'insertCompositionText', data: '한', isComposing: true });
  const denied = h.editQueries.at(-1);
  assert.equal(denied.startUnit, 1);
  assert.equal(denied.endUnit, 2);
  h.event('beforeinput', { inputType: 'insertParagraph', isComposing: false });
  assert.deepEqual(h.requests, []);
  h.controller.message({ ...denied, allowed: false });
  const split = h.splitQueries.at(-1);
  assert.ok(split);
  h.controller.message({ ...split, allowed: true });
  await h.end();
  assert.equal(h.input.value, '보도일시');
  assert.deepEqual(h.requests, []);
  // A later read-only reply legitimately wakes existing history intents. It
  // must not resurrect the newline descended from the rejected composition.
  h.controller.message({ kind: 'save' });
  await h.tick();
  assert.deepEqual(h.requests, []);
  assert.equal(h.rows()[0].text, '보도일시');
});
