import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor } from '../../src/editor/create-editor.ts';
import { PasswordAttemptError } from '../../src/editor/unlock-policy.ts';
function fixture(
  reply: any = { kind: 'unlock', error: 'WrongPasswordOrCorruptPayload', applied: false },
) {
  let closes = 0,
    unlocks = 0;
  const runtime = {
    async request(m: any) {
      if (m.kind === 'load')
        return { kind: 'load', error: 'EncryptedDocument', passwordRequired: true, applied: false };
      if (m.kind === 'unlock') {
        unlocks++;
        if (m.password !== 'correct') {
          if (reply instanceof Error) throw reply;
          return reply;
        }
        return { kind: 'unlock', content: { format: 'hwp5', paragraphs: [] } };
      }
      return { kind: m.kind, content: { format: 'hwp5', paragraphs: [] } };
    },
    dispose() {
      closes++;
    },
  };
  const editor = createEditor({ runtimeFactory: () => runtime });
  return {
    editor,
    get closes() {
      return closes;
    },
    get unlocks() {
      return unlocks;
    },
  };
}
for (const code of ['WrongPasswordOrCorruptPayload', 'InvalidPassword', 'InvalidPasswordUnicode'])
  test(`acknowledged ${code} permits retry on the same locked runtime`, async () => {
    const f = fixture({ kind: 'unlock', error: code, applied: false });
    try {
      await assert.rejects(
        f.editor.load(new Uint8Array([1]), { format: 'hwp5' }),
        /EncryptedDocument/,
      );
      for (let i = 0; i < 2; i++)
        await assert.rejects(
          f.editor.unlock('wrong'),
          (error) =>
            error instanceof PasswordAttemptError && error.retryable && error.message === code,
        );
      assert.equal(f.closes, 0);
      await f.editor.unlock('correct');
      assert.equal(f.unlocks, 3);
      assert.equal(f.editor.getEditorState().status, 'ready');
    } finally {
      await f.editor.dispose();
    }
    assert.equal(f.closes, 1);
  });
for (const failure of [
  new Error('TransportLost'),
  { kind: 'unlock', error: 'WrongPasswordOrCorruptPayload' },
  { kind: 'unlock', error: 'WrongPasswordOrCorruptPayload', applied: true },
  {
    kind: 'unlock',
    error: 'WrongPasswordOrCorruptPayload',
    applied: false,
    meta: { application: 'applied' },
  },
  {
    kind: 'unlock',
    error: 'WrongPasswordOrCorruptPayload',
    applied: false,
    meta: { application: 'unapplied', changed: true },
  },
  { kind: 'unlock', error: 'InvalidPassword', applied: false, changed: true },
  { kind: 'unlock', error: 'UnexpectedEnd', applied: false },
])
  test(`unrecoverable or ambiguous unlock failure releases candidate: ${JSON.stringify(failure)}`, async () => {
    const f = fixture(failure);
    try {
      await assert.rejects(f.editor.load(new Uint8Array([1]), { format: 'hwp5' }));
      await assert.rejects(
        f.editor.unlock('wrong'),
        (error) => !(error instanceof PasswordAttemptError),
      );
      assert.equal(f.closes, 1);
      await assert.rejects(f.editor.unlock('correct'), /NoLockedCandidate/);
      assert.equal(f.unlocks, 1);
    } finally {
      await f.editor.dispose();
    }
    assert.equal(f.closes, 1);
  });
test('cancel after retryable password failure releases exactly once', async () => {
  const f = fixture();
  await assert.rejects(f.editor.load(new Uint8Array([1]), { format: 'hwp5' }));
  await assert.rejects(f.editor.unlock('wrong'), PasswordAttemptError);
  await f.editor.cancelLoad();
  await assert.rejects(f.editor.unlock('correct'), /NoLockedCandidate/);
  await f.editor.dispose();
  assert.equal(f.closes, 1);
});
test('cancellation racing an acknowledged password failure cannot retain the candidate', async () => {
  let release!: () => void,
    entered!: () => void,
    closes = 0;
  const gate = new Promise<void>((r) => {
      release = r;
    }),
    ready = new Promise<void>((r) => {
      entered = r;
    });
  const e = createEditor({
    runtimeFactory: () => ({
      dispose() {
        closes++;
      },
      async request(m: any) {
        if (m.kind === 'load')
          return {
            kind: m.kind,
            error: 'EncryptedDocument',
            passwordRequired: true,
            applied: false,
          };
        entered();
        await gate;
        return { kind: m.kind, error: 'WrongPasswordOrCorruptPayload', applied: false };
      },
    }),
  });
  await assert.rejects(e.load(new Uint8Array([1]), { format: 'hwp5' }));
  const pending = e.unlock('wrong');
  await ready;
  const cancel = e.cancelLoad();
  release();
  await assert.rejects(pending, (error) => !(error instanceof PasswordAttemptError));
  await cancel;
  await assert.rejects(e.unlock('correct'), /NoLockedCandidate/);
  await e.dispose();
  assert.equal(closes, 1);
});
