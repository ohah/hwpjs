import test from 'node:test';
import assert from 'node:assert/strict';
import { channel, module, bytes } from './helpers/cow-worker-fixtures.mjs';

function assertEditedOwner(content) {
  assert(content && typeof content === 'object', 'content is required');
  assert.equal(content.format, 'hwp5');
  assert(Array.isArray(content.paragraphs));
  const owner = content.paragraphs.find((p) => p.section === 0 && p.paragraph === 15);
  assert(owner, 'edited owner is required');
  assert.equal(typeof owner.text, 'string');
  assert(owner.text.startsWith('x'.repeat(240)), 'fresh edited text is required');
}
for (const paragraph of [4, 15, 18])
  test(`실NodeWorker entry ${paragraph}: 비등록Module data projection/fresh fullNative동치`, async () => {
    const a = channel(),
      b = channel();
    try {
      for (const c of [a, b]) {
        await c.send({
          kind: 'initialize-runtime',
          wasmModule: module,
          referenceScope: 'worker-data',
        });
        assert.equal(c.brand, false);
        await c.send({ kind: 'load', format: 'hwp5', bytes });
        await c.send({ kind: 'enable' });
      }
      const message = {
        kind: 'splice',
        section: 0,
        paragraph,
        startUnit: paragraph === 4 ? 2 : 0,
        endUnit: paragraph === 4 ? 2 : 0,
        text: 'x'.repeat(240),
      };
      const fontsBefore = a.counts.hwp5_edit_font_faces;
      const patch = await a.send(message, 'owner-window-v1'),
        full = await b.send(message);
      assert.equal(
        a.counts.hwp5_edit_font_faces,
        fontsBefore,
        'partial Worker does not call full font getter',
      );
      assert.equal(b.counts.hwp5_edit_font_faces, fontsBefore + 1);
      assert.equal(patch.error, undefined);
      assert.equal(patch.content.viewKind, 'owner-window-patch');
      assert.equal(full.content.viewKind, undefined);
      assert.equal(full.content.format, 'hwp5');
      const refresh = await a.send({ kind: 'refresh' });
      assert.deepEqual(
        refresh.content,
        full.content,
        'worker display after partial production equals separate full Native',
      );
      const owner = full.content.paragraphs.find(
        (p) => p.section === 0 && p.paragraph === paragraph,
      );
      assert.equal(owner.text, patch.content.window.text.slice(0, -1));
      assert.equal(owner.currentReference.epoch, patch.content.receipt.epoch);
      assert.equal(patch.meta.application, 'applied');
      assert.equal(patch.meta.changed, true);
      assert.equal(a.counts.hwp5_edit_splice, 1);
      assert.equal(b.counts.hwp5_edit_splice, 1);
    } finally {
      await Promise.all([a.close(), b.close()]);
    }
  });
test('Worker public message본문 flag/알수없는 envelope preference는 full reply', async () => {
  const c = channel();
  try {
    await c.send({ kind: 'initialize-runtime', wasmModule: module });
    await c.send({ kind: 'load', format: 'hwp5', bytes });
    await c.send({ kind: 'enable' });
    for (const prefer of [undefined, 'unknown']) {
      const r = await c.send(
        {
          kind: 'splice',
          section: 0,
          paragraph: 15,
          startUnit: 0,
          endUnit: 0,
          text: 'x',
          viewProjection: 'owner-window-v1',
          ownerWindowProjection: true,
        },
        prefer,
      );
      assert.equal(r.content.format, 'hwp5');
      assert.equal(r.content.viewKind, undefined);
      assert.equal(r.error, undefined);
    }
  } finally {
    await c.close();
  }
});

for (const kind of ['set-edit-window', 'query-window'])
  test(`실Native thinsplice 다음 ${kind} stale preview 거부`, async () => {
    const a = channel(),
      b = channel();
    try {
      for (const c of [a, b]) {
        await c.send({
          kind: 'initialize-runtime',
          wasmModule: module,
          referenceScope: 'window-probe',
        });
        await c.send({ kind: 'load', format: 'hwp5', bytes });
        await c.send({ kind: 'enable' });
      }
      const m = {
        kind: 'splice',
        section: 0,
        paragraph: 15,
        startUnit: 0,
        endUnit: 0,
        text: 'x'.repeat(240),
      };
      const thin = await a.send(m, 'owner-window-v1');
      assert.equal(thin.content.viewKind, 'owner-window-patch');
      await b.send(m);
      const request =
        kind === 'set-edit-window'
          ? { kind, offset: null, count: null }
          : { kind, offset: 14, count: 3, requestId: 99 };
      const actual = await a.send(request),
        expected = await b.send(request);
      assert.equal(actual.error, undefined);
      assert.equal(expected.error, undefined);
      assertEditedOwner(actual.content);
      assertEditedOwner(expected.content);
      assert.deepEqual(actual.content, expected.content, kind);
    } finally {
      await Promise.all([a.close(), b.close()]);
    }
  });

test('실Native fastsplice→querywindow→full전환→readonlyquery/save 원전체동치', async () => {
  const a = channel(),
    b = channel();
  try {
    for (const c of [a, b]) {
      await c.send({
        kind: 'initialize-runtime',
        wasmModule: module,
        referenceScope: 'window-chain',
      });
      await c.send({ kind: 'load', format: 'hwp5', bytes });
      await c.send({ kind: 'enable' });
    }
    const before = a.counts.hwp5_edit_current_text_preview;
    const m = {
      kind: 'splice',
      section: 0,
      paragraph: 15,
      startUnit: 0,
      endUnit: 0,
      text: 'x'.repeat(240),
    };
    const thin = await a.send(m, 'owner-window-v1');
    assert.equal(thin.content.viewKind, 'owner-window-patch');
    assert.equal(a.counts.hwp5_edit_current_text_preview, before, 'fastsplice preview read0');
    await b.send(m);
    for (const request of [
      { kind: 'query-window', offset: 14, count: 3 },
      { kind: 'set-edit-window', offset: null, count: null },
      { kind: 'formatting-capabilities' },
      { kind: 'save', allowStaleLayout: true },
    ]) {
      const countBefore = a.counts.hwp5_edit_current_text_preview;
      const x = await a.send(request),
        y = await b.send(request);
      assert.equal(x.error, undefined, request.kind);
      assert.equal(y.error, undefined, request.kind);
      if (request.kind === 'query-window' || request.kind === 'set-edit-window') {
        assertEditedOwner(x.content);
        assertEditedOwner(y.content);
        assert.deepEqual(x.content, y.content, request.kind);
      }
      if (request.kind === 'formatting-capabilities') {
        for (const reply of [x, y]) {
          assert(reply.formattingCapabilities && typeof reply.formattingCapabilities === 'object');
          assert(Object.keys(reply.formattingCapabilities).length > 0);
        }
        assert.deepEqual(x.formattingCapabilities, y.formattingCapabilities);
      }
      if (request.kind === 'save') {
        assert(x.bytes instanceof Uint8Array && x.bytes.byteLength > 0);
        assert(y.bytes instanceof Uint8Array && y.bytes.byteLength > 0);
        assert.deepEqual(x.bytes, y.bytes, 'saved authoritative CFB bytes');
      }
      if (request.kind === 'query-window' || request.kind === 'set-edit-window')
        assert.equal(
          a.counts.hwp5_edit_current_text_preview - countBefore,
          1,
          'one fresh Native preview at read boundary',
        );
      assert.equal(x.historyRevision, y.historyRevision);
    }
    assert.equal(a.counts.hwp5_edit_splice, 1);
    assert.equal(b.counts.hwp5_edit_splice, 1);
  } finally {
    await Promise.all([a.close(), b.close()]);
  }
});
