import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHwp5EquationScriptEditApi,
  checkedHwp5EquationScript,
  clearHwp5EquationScriptCaptures,
} from '../../js/hwp5-equation-script-edit.mjs';
import { HWP5_EQUATION_SCRIPT_EDIT_ABI } from '../../js/abi-schema.mjs';
function fixture({
  code = 1,
  version = 1,
  mutateReply = () => {},
  cleanup = false,
  trap = false,
  allocationFail = false,
  rawReply = (r) => JSON.stringify(r),
} = {}) {
  let revision = 0,
    view = 1,
    session = 1,
    serial = 9007199254740992n,
    lease = null,
    reply,
    closed = false,
    ptr = 0,
    commits = 0,
    captures = 0,
    last;
  const buffers = new Map();
  const wasm = {
    hwp5_edit_equation_script_edit_version() {
      return version;
    },
    hwp5_edit_history_revision() {
      return revision;
    },
    hwp5_edit_equation_script_edit_capture(section, node, layout) {
      lease = null;
      captures++;
      if (layout > 1 || section !== 0 || node !== 10 || closed) return 0;
      const id = String(++serial);
      lease = { id, revision, view, session };
      reply = {
        schemaVersion: 1,
        scope: 'hwp5-equation-script-edit-capture',
        executionAuthority: false,
        lease: id,
        section,
        equationNode: node,
        layout: layout ? 'with-font' : 'version-only',
        historyRevision: revision,
        scriptUtf16LE: [120, 32, 111, 118, 101, 114, 32, 121],
        limits: {
          scriptUnits: 65535,
          scriptBytes: 262140,
          requestBytes: 1048576,
          replyBytes: 2097152,
        },
      };
      mutateReply(reply);
      return 1;
    },
    hwp5_edit_equation_script_edit_commit(id, _len) {
      const own = lease;
      lease = null;
      commits++;
      last = JSON.parse(new TextDecoder().decode(buffers.get(id)));
      if (
        !own ||
        last.lease !== own.id ||
        own.revision !== revision ||
        own.view !== view ||
        own.session !== session
      )
        return 0;
      if (trap) throw Error('NativeTrap');
      if (code === 1) {
        revision++;
        view++;
      }
      return code;
    },
  };
  const memory = {
    withBytes(bytes, run) {
      if (allocationFail) throw Error('InputAllocationFailed');
      const id = ++ptr;
      buffers.set(id, bytes.slice());
      let result;
      try {
        result = run(id, bytes.length);
      } catch (error) {
        buffers.delete(id);
        throw error;
      }
      buffers.delete(id);
      if (cleanup && commits) throw Error('OuterFreeFailed');
      return result;
    },
    error: () => Error('NativeRefusal'),
  };
  const settings = {
    wasm,
    memory,
    check() {
      if (closed) throw Error('EditorClosed');
    },
    output(run) {
      if (run() !== 1) throw Error('NativeRefusal');
      return { bytes: new TextEncoder().encode(rawReply(reply)) };
    },
  };
  return {
    api: createHwp5EquationScriptEditApi(settings),
    wasm,
    settings,
    stats: () => ({ commits, captures, last, lease }),
    mutate() {
      revision++;
      view++;
    },
    travelBack() {
      revision = 0;
      view++;
    },
    reopen() {
      session++;
      revision = 0;
      view++;
      lease = null;
    },
    close() {
      closed = true;
      lease = null;
      clearHwp5EquationScriptCaptures(wasm);
    },
  };
}
const capture = (f) => f.api.captureHwp5EquationScript(0, 10, 'with-font');
test('optional exactly three signatures; old and unknown profiles refuse', () => {
  assert.deepEqual(
    Object.entries(HWP5_EQUATION_SCRIPT_EDIT_ABI).map(([n, s]) => [n, s.params.length]),
    [
      ['hwp5_edit_equation_script_edit_version', 0],
      ['hwp5_edit_equation_script_edit_capture', 3],
      ['hwp5_edit_equation_script_edit_commit', 2],
    ],
  );
  for (const version of [0, 2, -1, '1'])
    assert.equal(fixture({ version }).api.supportsHwp5EquationScriptEditAbi(), false);
  const f = fixture();
  delete f.wasm.hwp5_edit_equation_script_edit_commit;
  assert.equal(f.api.supportsHwp5EquationScriptEditAbi(), false);
});
test('capture exposes script/coordinates only and opaque >2^53 lease stays private', () => {
  const f = fixture(),
    c = capture(f);
  assert(Object.isFrozen(c));
  assert.deepEqual(
    Object.keys(c).sort(),
    ['section', 'equationNode', 'layout', 'script', 'historyRevision'].sort(),
  );
  assert.equal(c.script, 'x over y');
  assert(!JSON.stringify(c).includes('9007199254740993'));
  assert.equal(f.api.isHwp5EquationScriptCurrent({ ...c }), false);
  const out = f.api.editHwp5EquationScript(c, 'a😀 over 나');
  assert.equal(out.application, 'applied');
  assert.deepEqual(f.stats().last, {
    schemaVersion: 1,
    lease: '9007199254740993',
    script: 'a😀 over 나',
  });
  assert.equal(f.stats().commits, 1);
  assert.throws(() => f.api.editHwp5EquationScript(c, 'retry'), /Stale/);
});
test('second capture invalidates first across two facades for the same WASM instance', () => {
  const f = fixture(),
    first = capture(f),
    other = createHwp5EquationScriptEditApi(f.settings),
    second = other.captureHwp5EquationScript(0, 10, 'version-only');
  assert.equal(f.api.isHwp5EquationScriptCurrent(first), false);
  assert.throws(() => f.api.editHwp5EquationScript(first, 'x'), /Stale/);
  assert.equal(other.isHwp5EquationScriptCurrent(second), true);
  assert.equal(other.editHwp5EquationScript(second, 'y').nativeCode, 1);
});
for (const args of [
  [0, 10, 'guess'],
  [-0, 10, 'with-font'],
  [0, NaN, 'with-font'],
  [0, 10, 'with-font', 'extra'],
])
  test(
    'new invalid capture clears Native lease even before selector admission ' +
      JSON.stringify(args),
    () => {
      const f = fixture(),
        c = capture(f);
      assert.throws(() => f.api.captureHwp5EquationScript(...args), /Invalid/);
      assert.equal(f.stats().lease, null);
      assert.equal(f.api.isHwp5EquationScriptCurrent(c), false);
      assert.equal(f.stats().commits, 0);
    },
  );
for (const mutateReply of [
  (r) => {
    r.witness = { hash: [1] };
  },
  (r) => {
    r.lease = '09007199254740993';
  },
  (r) => {
    r.lease = '18446744073709551616';
  },
  (r) => {
    r.historyRevision = 0xffffffff;
  },
  (r) => {
    r.scriptUtf16LE = [0xd800];
  },
  (r) => {
    r.equationNode = 11;
  },
  (r) => {
    r.limits.scriptUnits = 65536;
  },
])
  test('malformed capture clears retained lease without commit ' + mutateReply, () => {
    const f = fixture({ mutateReply });
    assert.throws(() => capture(f));
    assert.equal(f.stats().lease, null);
    assert.equal(f.stats().commits, 0);
  });
test('BOM and astral raw units preserved, never normalized or repaired', () => {
  const f = fixture({
      mutateReply: (r) => {
        r.scriptUtf16LE = [0xfeff, 0xd83d, 0xde00];
      },
    }),
    c = capture(f);
  assert.equal(c.script, '\ufeff😀');
});
for (const code of [0, 1, 2, 3, 99])
  test('every primitive result consumes capture including no-op ' + code, () => {
    const f = fixture({ code }),
      c = capture(f),
      out = f.api.editHwp5EquationScript(c, 'x over y');
    assert.equal(f.stats().commits, 1);
    assert.equal(f.stats().lease, null);
    assert.equal(f.api.isHwp5EquationScriptCurrent(c), false);
    assert.throws(() => f.api.editHwp5EquationScript(c, 'x'), /Stale/);
    assert.equal(out.changed, code === 1 ? true : [3, 99].includes(code) ? null : false);
  });
for (const change of ['mutate', 'travelBack', 'reopen'])
  test('stale Native frame rejects after ' + change + ' even when local revision matches', () => {
    const f = fixture(),
      c = capture(f);
    f[change]();
    if (change === 'mutate') assert.throws(() => f.api.editHwp5EquationScript(c, 'z'), /Stale/);
    else assert.equal(f.api.editHwp5EquationScript(c, 'z').nativeCode, 0);
    assert.equal(f.stats().commits, change === 'mutate' ? 0 : 1);
  });
test('closed editor rejects and never performs owner capture per current check', () => {
  const f = fixture(),
    c = capture(f),
    n = f.stats().captures;
  for (let i = 0; i < 100; i++) assert.equal(f.api.isHwp5EquationScriptCurrent(c), true);
  assert.equal(f.stats().captures, n);
  f.close();
  assert.equal(f.api.isHwp5EquationScriptCurrent(c), false);
  assert.throws(() => f.api.editHwp5EquationScript(c, 'x'), /Stale/);
});
for (const bad of ['', '\ud800', '\udc00', 'x'.repeat(65536)])
  test('invalid script preserves private capture for raw draft correction ' + bad.length, () => {
    const f = fixture(),
      c = capture(f);
    assert.throws(() => f.api.editHwp5EquationScript(c, bad));
    assert.equal(f.stats().commits, 0);
    assert.equal(f.api.isHwp5EquationScriptCurrent(c), true);
  });
test('UTF16 exact limit and one over, raw spelling never coerced', () => {
  assert.equal(checkedHwp5EquationScript('x'.repeat(65535)).length, 65535);
  assert.throws(() => checkedHwp5EquationScript('x'.repeat(65536)), /Limit/);
  assert.equal(checkedHwp5EquationScript('😀'.repeat(32767) + 'x').length, 65535);
  assert.throws(() => checkedHwp5EquationScript('😀'.repeat(32768)), /Limit/);
});
test('allocation failure before call revokes native lease and cannot retry', () => {
  const f = fixture({ allocationFail: true }),
    c = capture(f);
  assert.throws(() => f.api.editHwp5EquationScript(c, 'x'), /Allocation/);
  assert.equal(f.stats().lease, null);
  assert.equal(f.api.isHwp5EquationScriptCurrent(c), false);
  assert.equal(f.stats().commits, 0);
});
test('Native trap and post-completion cleanup cannot retry or lose known outcome', () => {
  const f = fixture({ trap: true }),
    c = capture(f),
    out = f.api.editHwp5EquationScript(c, 'x');
  assert.equal(out.application, 'unknown');
  assert.equal(f.api.isHwp5EquationScriptCurrent(c), false);
  const g = fixture({ cleanup: true }),
    d = capture(g),
    known = g.api.editHwp5EquationScript(d, 'x');
  assert.equal(known.application, 'applied');
  assert.equal(known.cleanupError, 'OuterFreeFailed');
  assert.equal(g.api.isHwp5EquationScriptCurrent(d), false);
});

test('raw JSON negative-zero unit is rejected before Native lease can remain live', () => {
  const f = fixture({
    rawReply: (r) =>
      JSON.stringify({ ...r, scriptUtf16LE: [0] }).replace(
        '"scriptUtf16LE":[0]',
        '"scriptUtf16LE":[-0]',
      ),
  });
  assert.throws(() => capture(f));
  assert.equal(f.stats().lease, null);
  assert.equal(f.stats().commits, 0);
});

test('unsupported profile never probes unknown Native capture semantics', () => {
  const f = fixture({ version: 2 });
  assert.throws(() => capture(f), /Unavailable/);
  assert.equal(f.stats().captures, 0);
  assert.equal(f.stats().commits, 0);
});

test('dialog discard revokes active Native lease but stale or cloned targets cannot discard newer capture', () => {
  const f = fixture(),
    first = capture(f),
    second = capture(f),
    n = f.stats().captures;
  assert.equal(f.api.discardHwp5EquationScript(first), false);
  assert.equal(f.api.discardHwp5EquationScript({ ...second }), false);
  assert.equal(f.stats().captures, n);
  assert.equal(f.api.discardHwp5EquationScript(second), true);
  assert.equal(f.stats().lease, null);
  assert.equal(f.stats().commits, 0);
  assert.equal(f.api.isHwp5EquationScriptCurrent(second), false);
  assert.equal(f.api.discardHwp5EquationScript(second), false);
});
