import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyRaw } from './style-preservation/text-record-oracle.mjs';
assert(process.env.HWPJS_TEST_WASM, 'Explicit retained protection candidate required');
test('retained click Worker edits outside scopes while preserving field barriers source and redo', async (t) => {
  const previous = { self: globalThis.self, fetch: globalThis.fetch },
    replies = [];
  globalThis.self = { postMessage: (value) => replies.push(value) };
  globalThis.fetch = async () => new Response(readFileSync(process.env.HWPJS_TEST_WASM));
  const send = async (data) => {
    await self.onmessage({ data });
    assert.equal(replies.length, 1);
    return replies.shift();
  };
  t.after(async () => {
    try {
      await send({ kind: 'load', format: 'test-close', bytes: [] });
    } finally {
      globalThis.fetch = previous.fetch;
      if (previous.self === undefined) delete globalThis.self;
      else globalThis.self = previous.self;
    }
  });
  await import(`../../web/preview/reader-worker.mjs?retained-click=${Math.random()}`);
  const input = readFileSync('reference/rhwp/samples/issue1921/59043_regulatory_analysis.hwp');
  assert.equal((await send({ kind: 'load', format: 'hwp5', bytes: input })).error, undefined);
  assert.equal((await send({ kind: 'enable' })).error, undefined);
  const active = await send({ kind: 'set-edit-window', offset: 0, count: 1 });
  assert.equal(active.error, undefined);
  const selected = (reply) => reply.content.paragraphs.find((p) => !p.windowContext);
  assert.equal(selected(active).editable, true);
  const changed = await send({
    kind: 'splice',
    section: 0,
    paragraph: 0,
    startUnit: 0,
    endUnit: 0,
    text: 'Worker😀',
  });
  assert.equal(changed.error, undefined);
  assert.equal(changed.historyRevision, 1);
  assert.equal(selected(changed).editable, true);
  const saved = await send({ kind: 'save', allowStaleLayout: true });
  assert.equal(saved.error, undefined);
  verifyRaw(input, saved.bytes, 0, 0, 0, 0, 'Worker😀', { skipLocalFieldAttributes: true });
  const protectedView = await send({ kind: 'query-edit-window', offset: 52, count: 1 });
  assert.equal(protectedView.error, undefined);
  assert.equal(selected(protectedView).editable, false);
  assert.equal((await send({ kind: 'undo' })).error, undefined);
  assert.deepEqual(Buffer.from((await send({ kind: 'save' })).bytes), input);
  assert.equal(
    (
      await send({
        kind: 'splice',
        section: 0,
        paragraph: 52,
        startUnit: 0,
        endUnit: 0,
        text: '거부',
      })
    ).error,
    'UnsupportedCrossParagraphField',
  );
  assert.deepEqual(Buffer.from((await send({ kind: 'save' })).bytes), input);
  const redone = await send({ kind: 'redo' });
  assert.equal(redone.error, undefined);
  assert.equal(
    redone.content.window.requestedOffset,
    0,
    'query cannot replace active editable window',
  );
  assert.deepEqual((await send({ kind: 'save', allowStaleLayout: true })).bytes, saved.bytes);
});
