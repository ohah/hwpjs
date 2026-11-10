import test from 'node:test';
import assert from 'node:assert/strict';
import { applyNativeEdit } from '../../js/native-edit-outcome.mjs';
const bytes = new Uint8Array([123, 125]);
function request(
  code,
  { diagnostic = false, cleanup = false, trap = false, allocate = false } = {},
) {
  let calls = 0;
  const memory = {
    withBytes(input, invoke) {
      assert.equal(input, bytes);
      if (allocate) throw Error('AllocationFailed');
      const result = invoke(11, input.length);
      if (cleanup) throw Error('CleanupFailed');
      return result;
    },
    error() {
      if (diagnostic) throw Error('DiagnosticFailed');
      return Error('NativeDenied');
    },
  };
  const run = () =>
    applyNativeEdit(
      memory,
      bytes,
      (ptr, length) => {
        assert.equal(ptr, 11);
        assert.equal(length, 2);
        calls++;
        if (trap) throw Error('NativeTrap');
        return code;
      },
      'InvalidNativeResult',
    );
  return { run, calls: () => calls };
}

test('Native completion retains each primitive application state with one call', () => {
  for (const [code, application, changed] of [
    [0, 'unapplied', false],
    [1, 'applied', true],
    [2, 'unapplied', false],
    [3, 'unknown', null],
  ]) {
    const h = request(code);
    const result = h.run();
    assert.equal(result.nativeCode, code);
    assert.equal(result.application, application);
    assert.equal(result.changed, changed);
    if (code === 0 || code === 3) assert.equal(result.error, 'NativeDenied');
    assert.equal(h.calls(), 1);
  }
});

test('Native rejection stays unapplied when diagnostics fail after the primitive result', () => {
  const h = request(0, { diagnostic: true });
  assert.deepEqual(h.run(), {
    nativeCode: 0,
    application: 'unapplied',
    changed: false,
    error: 'DiagnosticFailed',
    refreshRequired: true,
  });
  assert.equal(h.calls(), 1);
  const unknown = request(3, { diagnostic: true });
  assert.equal(unknown.run().application, 'unknown');
  assert.equal(unknown.calls(), 1);
});

test('cleanup cannot erase applied or rejected facts and never causes retry', () => {
  for (const code of [0, 1, 2, 3]) {
    const h = request(code, { cleanup: true });
    const result = h.run();
    assert.equal(result.nativeCode, code);
    assert.equal(result.application, code === 1 ? 'applied' : code === 3 ? 'unknown' : 'unapplied');
    assert.equal(result.cleanupError, 'CleanupFailed');
    assert.equal(result.refreshRequired, true);
    if (code === 0 || code === 3) assert.equal(result.error, 'NativeDenied');
    assert.equal(h.calls(), 1);
  }
});

test('pre-call allocation errors remain throws while traps and invalid Native codes are uncertain', () => {
  const before = request(1, { allocate: true });
  assert.throws(before.run, /AllocationFailed/);
  assert.equal(before.calls(), 0);
  const trapped = request(1, { trap: true });
  assert.deepEqual(trapped.run(), { application: 'unknown', changed: null, error: 'NativeTrap' });
  assert.equal(trapped.calls(), 1);
  const invalid = request(44);
  assert.deepEqual(invalid.run(), {
    application: 'unknown',
    changed: null,
    error: 'InvalidNativeResult',
  });
  assert.equal(invalid.calls(), 1);
});
