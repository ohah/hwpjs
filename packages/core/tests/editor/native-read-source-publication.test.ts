import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor } from '../../src/editor/create-editor.ts';
import {
  createNativeReadSourceLifecycle,
  bindNativeReadSourceRuntime,
} from '../../src/internal/native-read-source-origin.ts';
import { readNativeReadSourceEvidence } from '../../src/internal/native-read-source-evidence.ts';
import type { EditorRuntime, RuntimeReply } from '../../src/contracts.ts';
// Core publication regression with a private synthetic adapter, not module qualification.
function factory(qualified = true) {
  return () => {
    let alive = true,
      revision = 0,
      serial = 0;
    const contract = { contract: 'hwp5-exclusive-text-delta-v1' as const, sha256: 'unit-only' };
    const life = createNativeReadSourceLifecycle(
      () => (qualified ? contract : undefined),
      () => alive && qualified,
    );
    const runtime: EditorRuntime = {
      async request(message, context) {
        const ticket = life.begin(message.kind, context);
        let r: RuntimeReply;
        if (message.kind === 'save')
          r = { kind: 'save', bytes: new Uint8Array([revision]), format: 'hwp5' };
        else if (message.kind === 'document-text-read-binding') {
          r = {
            kind: message.kind,
            documentTextReadBinding: {
              schemaVersion: 1,
              scope: 'native-document-text-read-binding',
              executionAuthority: false,
              format: 'hwp5',
              session: 'unit',
              epoch: '1',
              serial: String(serial),
            },
          };
        } else if (message.mode === 'noop' || message.mode === 'reject') {
          r = {
            kind: message.kind,
            applied: false,
            ...(message.mode === 'reject' ? { error: 'PredictableRefusal' } : {}),
            meta: { application: 'unapplied', changed: false },
          };
        } else {
          if (message.kind === 'hwp5-chart-data-apply' || message.kind === 'redo') revision++;
          if (message.kind === 'undo') revision--;
          r = {
            kind: message.kind,
            content: { format: 'hwp5', readOnly: false, paragraphs: [], value: revision },
            historyRevision: revision,
            historyStats: { protocolVersion: 2, poisoned: false },
            documentTextReadBinding: {
              schemaVersion: 1,
              scope: 'native-document-text-read-binding',
              executionAuthority: false,
              format: 'hwp5',
              session: 'unit',
              epoch: '1',
              serial: String(++serial),
            },
            meta: { application: 'applied', changed: true },
          };
        }
        life.publish(ticket, r, context, serial, true);
        return r;
      },
      dispose() {
        alive = false;
        life.revoke();
      },
    };
    bindNativeReadSourceRuntime(runtime, life.consume);
    return runtime;
  };
}
test('Core first edit second edit undo redo save and fresh load publish only fresh private origins', async () => {
  const editor = createEditor({ runtimeFactory: factory() });
  try {
    await editor.load(new Uint8Array([0]), { format: 'hwp5', editable: true });
    const check = () => assert(readNativeReadSourceEvidence(editor.getEditorState()));
    check();
    for (let i = 0; i < 2; i++) {
      const old = editor.getEditorState();
      const result = await editor.requestExperimental(
        { kind: 'hwp5-chart-data-apply' },
        { mutation: true, token: old.token },
      );
      assert.equal(result.status, 'committed-with-snapshot');
      check();
      assert.equal(readNativeReadSourceEvidence(old), undefined);
      await editor.save();
      check();
    }
    await editor.undo();
    check();
    await editor.redo();
    check();
    const beforeReopen = editor.getEditorState();
    const saved = await editor.save();
    check();
    await editor.load(saved.bytes, { format: 'hwp5', editable: true });
    check();
    assert.equal(readNativeReadSourceEvidence(beforeReopen), undefined);
  } finally {
    await editor.dispose();
  }
  assert.equal(readNativeReadSourceEvidence(editor.getEditorState()), undefined);
});
test('synthetic capabilities and complete wire binding without module qualification never brand Core state', async () => {
  const editor = createEditor({ runtimeFactory: factory(false) });
  try {
    await editor.load(new Uint8Array([0]), { format: 'hwp5', editable: true });
    assert.equal(readNativeReadSourceEvidence(editor.getEditorState()), undefined);
    await editor.requestExperimental(
      { kind: 'hwp5-chart-data-apply' },
      { mutation: true, token: editor.getEditorState().token },
    );
    assert.equal(readNativeReadSourceEvidence(editor.getEditorState()), undefined);
  } finally {
    await editor.dispose();
  }
});

for (const mode of ['noop', 'reject'])
  test(`unchanged ${mode} renews evidence without reviving old state or discarding redo`, async () => {
    const editor = createEditor({ runtimeFactory: factory() });
    try {
      await editor.load(new Uint8Array([0]), { format: 'hwp5', editable: true });
      await editor.requestExperimental(
        { kind: 'hwp5-chart-data-apply' },
        { mutation: true, token: editor.getEditorState().token },
      );
      await editor.undo();
      const old = editor.getEditorState();
      const result = await editor.requestExperimental(
        { kind: 'hwp5-chart-data-apply', mode },
        { mutation: true, token: old.token },
      );
      assert(['known-no-op', 'rejected-unapplied'].includes(String(result.status)));
      assert(readNativeReadSourceEvidence(editor.getEditorState()));
      assert.equal(readNativeReadSourceEvidence(old), undefined);
      assert.equal(editor.getEditorState().operationRevision, old.operationRevision);
      assert.equal(editor.getEditorState().content, old.content);
      assert.equal(editor.getEditorState().nativeHistoryRevision, old.nativeHistoryRevision);
      assert.equal((await editor.redo()).status, 'committed-with-snapshot');
      assert(readNativeReadSourceEvidence(editor.getEditorState()));
    } finally {
      await editor.dispose();
    }
  });
