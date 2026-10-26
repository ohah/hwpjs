import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { attachHwpxOleSources } from '../../web/preview/hwpx-ole-content.mjs';
import { layoutPageContent } from '../../web/preview/page-content-layout.mjs';

test('OLE attachment separates absent ABI, absent objects, binding failures and resource failures', () => {
  const content = () => ({ paragraphs: [{ section: 0, paragraph: 0, text: '\ufffc' }] });
  const site = { ole_node: 3, paragraph: 1, anchor_unit: 0, error_name: null };
  const editor = { oleSites: () => [site], oleSource: () => ({ binary_item_id: 'ole3' }) };
  const absent = attachHwpxOleSources({}, { ...content(), oles: ['stale'] }, false);
  assert.equal(absent.oleSourceAvailable, false);
  assert.equal(absent.oles, undefined);
  assert.deepEqual(attachHwpxOleSources({ oleSites: () => [] }, content(), true).oles, []);
  const value = attachHwpxOleSources(editor, content(), true);
  assert.equal(value.oles[0].state, 'located');
  assert.equal(value.oles[0].paintable, false);
  const broken = content();
  broken.paragraphs[0].text = 'x';
  assert.equal(
    attachHwpxOleSources(editor, broken, true).oles[0].error,
    'OleDisplayBindingMismatch',
  );
  const failure = {
    oleSites: () => [site],
    oleSource() {
      throw Error('BadGeometry');
    },
  };
  assert.equal(attachHwpxOleSources(failure, content(), true).oles[0].sourceError, 'BadGeometry');
  for (const error of ['OutOfMemory', 'LimitExceeded']) {
    assert.throws(
      () =>
        attachHwpxOleSources(
          {
            oleSites() {
              throw Error(error);
            },
          },
          content(),
          true,
        ),
      new RegExp(error),
    );
    assert.throws(
      () =>
        attachHwpxOleSources(
          {
            ...editor,
            oleSource() {
              throw Error(error);
            },
          },
          content(),
          true,
        ),
      new RegExp(error),
    );
  }
  const window = content();
  window.window = true;
  window.paragraphs[0].paragraph = 2;
  assert.deepEqual(attachHwpxOleSources(editor, window, true).oles, []);
});

test(
  'actual Worker OLE remains visible as unsupported rendering while current coordinates follow history',
  { skip: !process.env.HWPJS_TEST_WASM },
  async (t) => {
    const previousSelf = globalThis.self,
      previousFetch = globalThis.fetch,
      replies = [];
    globalThis.self = { postMessage: (reply) => replies.push(reply) };
    globalThis.fetch = async () => new Response(readFileSync(process.env.HWPJS_TEST_WASM));
    await import('../../web/preview/reader-worker.mjs?ole-source=' + Date.now());
    t.after(async () => {
      try {
        await self.onmessage({ data: { kind: 'load', format: 'close-audit', bytes: [] } });
      } finally {
        globalThis.self = previousSelf;
        globalThis.fetch = previousFetch;
      }
    });
    const send = async (data) => {
      await self.onmessage({ data });
      assert.equal(replies.length, 1);
      const r = replies.shift();
      assert.equal(r.error, undefined);
      return r;
    };
    await send({
      kind: 'load',
      format: 'hwpx',
      bytes: readFileSync('reference/rhwp/samples/hwpx/143E433F503322BD33.hwpx'),
    });
    const initial = await send({ kind: 'enable' });
    const before = initial.content.oles;
    assert.equal(initial.content.oleSourceAvailable, true);
    assert.equal(before.length, 1);
    assert.equal(before[0].paragraph, 10);
    assert.equal(before[0].anchorUnit, 1);
    assert.equal(before[0].source.binary_item_id, 'ole3');
    assert.equal(before[0].paintable, false);
    const layout = layoutPageContent(initial.content, () => 8);
    assert.equal(layout.error, 'UnsupportedOlePageContent');
    assert.equal(layout.oleNode, before[0].oleNode);
    const edited = await send({
      kind: 'splice',
      section: 0,
      paragraph: 10,
      startUnit: 0,
      endUnit: 0,
      text: '앞😀',
    });
    assert.equal(edited.content.oles[0].anchorUnit, 4);
    assert.equal(before[0].anchorUnit, 1);
    const undone = await send({ kind: 'undo' });
    assert.deepEqual(undone.content.oles, before);
    const redone = await send({ kind: 'redo' });
    assert.equal(redone.content.oles[0].anchorUnit, 4);
  },
);
