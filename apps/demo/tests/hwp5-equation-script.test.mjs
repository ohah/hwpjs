import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEditor,
  createParagraphSelection,
  EDIT_HWP5_EQUATION_SCRIPT_COMMAND,
  hwp5EquationScriptSources,
} from '../../../packages/core/src/index.ts';
import { bindRuntimeAdmission } from '../../../packages/core/src/internal/runtime-admission.ts';
import { createHwp5EquationScriptEditApi } from '../../../js/hwp5-equation-script-edit.mjs';
import { createHwp5EquationScriptCommands } from '../../../web/preview/hwp5-equation-script-command.mjs';
import { installFormattingTestStyles } from './formatting-style-preload.mjs';
import { documentFixture, fire, all } from './formatting-dialog-test-dom.ts';
const styles = installFormattingTestStyles();
const { createHwp5EquationScriptTool } = await import('../src/hwp5-equation-script-tool.ts');
styles.deregister();
const selector = { section: 0, equationNode: 18, layout: 'version-only' };
const tick = () => new Promise((resolve) => setImmediate(resolve));
// Controlled Core/Worker/facade doubles; not a Native or actual browser cohort.
function fixture(extra = {}) {
  let revision = 0,
    sequence = 0,
    closed = false;
  const calls = [],
    content = {
      format: 'hwp5',
      paragraphs: [
        {
          section: 0,
          paragraph: 2,
          text: 'a\ufffcb',
          editable: true,
          selectionOwner: 'section:0:body',
          currentReference: { kind: 'original', index: 2 },
          equations: [{ node: 18, unit: 1 }],
          ...extra.row,
        },
      ],
      ...extra.content,
    };
  const runtime = {
    async request(message, context) {
      calls.push(message);
      if (message.kind === 'hwp5-equation-script-capture') await extra.capture?.(message);
      if (message.kind === 'hwp5-equation-script-edit' && message.script !== 'x\r\ny') revision++;
      const noop = message.kind === 'hwp5-equation-script-edit' && message.script === 'x\r\ny';
      return {
        kind: message.kind,
        historyRevision: revision,
        historyRevisions: [revision],
        historyStats: { protocolVersion: 2 },
        meta: {
          context,
          application: noop ? 'unapplied' : 'applied',
          changed: message.kind === 'hwp5-equation-script-edit' && !noop,
        },
        ...(message.kind === 'hwp5-equation-script-capture'
          ? {
              equationScriptCapture: {
                ...selector,
                script: 'x\r\ny',
                historyRevision: revision,
                leaseKey: 'worker-' + ++sequence,
              },
            }
          : message.kind === 'hwp5-equation-script-close'
            ? { released: true }
            : { content }),
      };
    },
    dispose() {
      closed = true;
    },
  };
  bindRuntimeAdmission(
    runtime,
    async (message, context, admit) => {
      admit();
      return runtime.request(message, context);
    },
    () => !closed,
  );
  const editor = createEditor({ runtimeFactory: () => runtime });
  return {
    editor,
    calls,
    content,
    async open() {
      await editor.load(new Uint8Array([1]), { format: 'hwp5' });
    },
    async select() {
      const state = editor.getEditorState();
      await editor.setSelection(
        createParagraphSelection(state, { section: 0, paragraph: 2, startUnit: 1, endUnit: 2 }),
      );
    },
    captures: () => calls.filter((m) => m.kind === 'hwp5-equation-script-capture'),
    writes: () => calls.filter((m) => m.kind === 'hwp5-equation-script-edit'),
  };
}
test('Core opaque target, precise selected anchor and one Native-facing no-op commit', async () => {
  const f = fixture();
  await f.open();
  assert.equal(hwp5EquationScriptSources(f.editor.getEditorState())[0].equationNode, 18);
  assert.equal(f.captures().length, 0);
  await assert.rejects(f.editor.getHwp5EquationScript(selector), /SelectionRequired/);
  await f.select();
  const r = await f.editor.getHwp5EquationScript(selector);
  assert.equal(r.state, 'available');
  assert(!JSON.stringify(r).includes('worker-'));
  assert(!('leaseKey' in r));
  const clone = await f.editor.dispatchCommand(EDIT_HWP5_EQUATION_SCRIPT_COMMAND, {
    target: { ...r.target },
    script: 'z',
  });
  assert.equal(clone.status, 'rejected-unapplied');
  await assert.rejects(
    async () =>
      f.editor.dispatchCommand(EDIT_HWP5_EQUATION_SCRIPT_COMMAND, { target: r.target, script: '' }),
    /EmptyEquationScript/,
  );
  const result = await f.editor.dispatchCommand(EDIT_HWP5_EQUATION_SCRIPT_COMMAND, {
    target: r.target,
    script: r.script,
  });
  assert.equal(result.status, 'known-no-op');
  assert.equal(f.writes().length, 1);
  const again = await f.editor.dispatchCommand(EDIT_HWP5_EQUATION_SCRIPT_COMMAND, {
    target: r.target,
    script: 'z',
  });
  assert.equal(again.status, 'rejected-unapplied');
  await f.editor.dispose();
});
test('Core owner and generic bypass refusals preserve typed-only boundary', async () => {
  for (const extra of [
    { row: { selectionOwner: 'cell:0', tableCell: {} } },
    { row: { editable: false } },
    { content: { window: {} } },
  ]) {
    const f = fixture(extra);
    await f.open();
    try {
      await f.select();
    } catch {}
    try {
      const r = await f.editor.getHwp5EquationScript(selector);
      assert.equal(r.state, 'unavailable');
    } catch (e) {
      assert.match(e.message, /Owner|Editable|Selection|Unavailable/);
    }
    assert.equal(f.captures().length, 0);
    await f.editor.dispose();
  }
  const f = fixture();
  await f.open();
  await f.select();
  for (const kind of [
    'hwp5-equation-script-capture',
    'hwp5-equation-script-close',
    'hwp5-equation-script-edit',
  ]) {
    await assert.rejects(f.editor.readResource(kind, {}));
    await assert.rejects(
      async () => f.editor.requestExperimental({ kind }),
      /UseTypedEditorOperation/,
    );
  }
  assert.equal(f.captures().length, 0);
  assert.equal(f.writes().length, 0);
  await f.editor.dispose();
});
test('delayed first capture cannot publish after a newer queued capture starts', async () => {
  let finish, entered;
  const started = new Promise((r) => {
    entered = r;
  });
  const f = fixture({
    capture: () => {
      entered();
      return new Promise((r) => {
        finish = r;
      });
    },
  });
  await f.open();
  await f.select();
  const first = f.editor.getHwp5EquationScript(selector);
  const checked = assert.rejects(first, /StaleHwp5EquationScriptTarget/);
  await started;
  const second = f.editor.getHwp5EquationScript({ ...selector, equationNode: 999 });
  const rejected = assert.rejects(second, /Owner/);
  finish();
  await checked;
  await rejected;
  assert.equal(f.captures().length, 1);
  await f.editor.dispose();
});
test('invalid newer request also fences a pending capture before publication', async () => {
  let finish, entered;
  const started = new Promise((r) => {
    entered = r;
  });
  const f = fixture({
    capture: () => {
      entered();
      return new Promise((r) => {
        finish = r;
      });
    },
  });
  await f.open();
  await f.select();
  const first = f.editor.getHwp5EquationScript(selector);
  const rejected = assert.rejects(first, /StaleHwp5EquationScriptTarget/);
  await started;
  await assert.rejects(
    async () => f.editor.getHwp5EquationScript({ ...selector, layout: 'auto' }),
    /Selector/,
  );
  finish();
  await rejected;
  await f.editor.dispose();
});
function facade() {
  let active,
    epoch = 0,
    writes = 0,
    discards = 0;
  const observed = new WeakMap();
  const api = {
    historyStats: () => ({ protocolVersion: 2 }),
    supportsHwp5EquationScriptEditAbi: () => true,
    captureHwp5EquationScript(section, equationNode, layout) {
      active = Object.freeze({ section, equationNode, layout, script: 'x', historyRevision: 0 });
      observed.set(active, epoch);
      return active;
    },
    isHwp5EquationScriptCurrent: (value) => value === active, // Advisory intentionally misses Native epoch.
    discardHwp5EquationScript(value) {
      if (value !== active) return false;
      active = undefined;
      discards++;
      return true;
    },
    editHwp5EquationScript(value, script) {
      assert.equal(value, active);
      active = undefined;
      writes++;
      return observed.get(value) !== epoch
        ? { application: 'unapplied', nativeCode: 0, error: 'StaleNativeEpoch' }
        : {
            application: script === 'x' ? 'unapplied' : 'applied',
            nativeCode: script === 'x' ? 2 : 1,
          };
    },
  };
  return { api, expire: () => epoch++, writes: () => writes, discards: () => discards };
}
test('Worker retains original SDK object and Native owns epoch authority after advisory true', () => {
  const f = facade(),
    worker = createHwp5EquationScriptCommands(
      () => f.api,
      () => true,
    );
  const r = worker.capture({ kind: 'hwp5-equation-script-capture', ...selector });
  assert(!('capture' in r));
  f.expire();
  const result = worker.edit({
    kind: 'hwp5-equation-script-edit',
    leaseKey: r.leaseKey,
    script: 'z',
  });
  assert.equal(result.error, 'StaleNativeEpoch');
  assert.equal(f.writes(), 1);
  assert.throws(
    () => worker.edit({ kind: 'hwp5-equation-script-edit', leaseKey: r.leaseKey, script: 'z' }),
    /Stale/,
  );
});
test('Worker failed new capture and exact cancel retire only the owned capture', () => {
  const f = facade(),
    worker = createHwp5EquationScriptCommands(
      () => f.api,
      () => true,
    );
  const a = worker.capture({ kind: 'hwp5-equation-script-capture', ...selector });
  const b = worker.capture({ kind: 'hwp5-equation-script-capture', ...selector });
  assert.equal(worker.close({ kind: 'hwp5-equation-script-close', leaseKey: a.leaseKey }), false);
  assert.throws(() =>
    worker.edit({ kind: 'hwp5-equation-script-edit', leaseKey: b.leaseKey, script: '' }),
  );
  assert.equal(
    worker.edit({ kind: 'hwp5-equation-script-edit', leaseKey: b.leaseKey, script: 'x' })
      .nativeCode,
    2,
  );
  worker.capture({ kind: 'hwp5-equation-script-capture', ...selector });
  assert.throws(() =>
    worker.capture({ kind: 'hwp5-equation-script-capture', ...selector, layout: 'auto' }),
  );
  assert.equal(worker.close({ kind: 'hwp5-equation-script-close', leaseKey: b.leaseKey }), false);
  assert.equal(f.writes(), 1);
  assert.equal(f.discards(), 2);
});
test('UI selects the actual EQEDIT anchor and confirms once; cancel and IME never commit', async () => {
  const f = fixture();
  await f.open();
  const dom = documentFixture();
  const tool = createHwp5EquationScriptTool({
    root: dom.root,
    editor: f.editor,
    onStatus() {},
    onClose() {},
  });
  tool.open();
  let nodes = all(dom.root),
    select = nodes.find((n) => n.tagName === 'SELECT');
  select.value = '0';
  fire(select, 'change');
  await tick();
  await tick();
  assert.equal(f.captures().length, 1);
  assert.equal(f.editor.getEditorState().selection.startUnit, 1);
  assert.equal(f.editor.getEditorState().selection.endUnit, 2);
  nodes = all(dom.root);
  const form = nodes.find((n) => n.tagName === 'FORM'),
    text = nodes.find((n) => n.tagName === 'TEXTAREA'),
    confirm = nodes.find((n) => n.textContent === '선택한 기존 수식에 적용');
  assert.equal(text.value, 'x\r\ny');
  fire(form, 'submit');
  assert.equal(f.writes().length, 0);
  assert.equal(confirm.hidden, false);
  fire(form.parentElement.parentElement, 'compositionstart');
  fire(confirm, 'click');
  await tick();
  assert.equal(f.writes().length, 0);
  fire(form.parentElement.parentElement, 'compositionend');
  fire(confirm, 'click');
  await tick();
  await tick();
  assert.equal(f.writes().length, 1);
  assert.equal(f.writes()[0].script, 'x\r\ny');
  tool.dispose();
  await f.editor.dispose();
});
test('a newer successful capture owns the only active target and stale cancel cannot retire it', async () => {
  const f = fixture(),
    other = fixture();
  await f.open();
  await other.open();
  await f.select();
  await other.select();
  const a = await f.editor.getHwp5EquationScript(selector),
    b = await f.editor.getHwp5EquationScript(selector);
  assert.equal(
    (
      await other.editor.dispatchCommand(EDIT_HWP5_EQUATION_SCRIPT_COMMAND, {
        target: b.target,
        script: 'z',
      })
    ).status,
    'rejected-unapplied',
  );
  assert.equal(
    (
      await f.editor.dispatchCommand(EDIT_HWP5_EQUATION_SCRIPT_COMMAND, {
        target: a.target,
        script: 'z',
      })
    ).status,
    'rejected-unapplied',
  );
  assert.equal(await f.editor.releaseHwp5EquationScript({ ...b.target }), false);
  await f.editor.releaseHwp5EquationScript(a.target);
  assert.equal(
    (
      await f.editor.dispatchCommand(EDIT_HWP5_EQUATION_SCRIPT_COMMAND, {
        target: b.target,
        script: 'z',
      })
    ).status,
    'committed-with-snapshot',
  );
  assert.equal(f.writes().length, 1);
  await f.editor.dispose();
  await other.editor.dispose();
});
test('UI late capture after cancel is released and never presents an applicable draft', async () => {
  let finish, entered;
  const started = new Promise((r) => {
    entered = r;
  });
  const f = fixture({
    capture: () => {
      entered();
      return new Promise((r) => {
        finish = r;
      });
    },
  });
  await f.open();
  const dom = documentFixture(),
    tool = createHwp5EquationScriptTool({
      root: dom.root,
      editor: f.editor,
      onStatus() {},
      onClose() {},
    });
  tool.open();
  const select = all(dom.root).find((n) => n.tagName === 'SELECT');
  select.value = '0';
  fire(select, 'change');
  await started;
  fire(
    all(dom.root).find((n) => n.textContent === '취소'),
    'click',
  );
  finish();
  await tick();
  await tick();
  assert.equal(all(dom.root).filter((n) => n.tagName === 'DIALOG').length, 0);
  assert.equal(f.writes().length, 0);
  assert.equal(f.calls.filter((m) => m.kind === 'hwp5-equation-script-close').length, 1);
  tool.dispose();
  await f.editor.dispose();
});
test('UI confirmation back and external selection change never commit or silently retarget', async () => {
  const f = fixture();
  await f.open();
  const dom = documentFixture();
  const tool = createHwp5EquationScriptTool({
    root: dom.root,
    editor: f.editor,
    onStatus() {},
    onClose() {},
  });
  tool.open();
  let nodes = all(dom.root);
  const select = nodes.find((n) => n.tagName === 'SELECT');
  select.value = '0';
  fire(select, 'change');
  await tick();
  await tick();
  nodes = all(dom.root);
  const form = nodes.find((n) => n.tagName === 'FORM');
  fire(form, 'submit');
  fire(
    nodes.find((n) => n.textContent === '계속 편집'),
    'click',
  );
  assert.equal(nodes.find((n) => n.textContent === '선택한 기존 수식에 적용').hidden, true);
  await f.editor.setSelection(null);
  await tick();
  assert.equal(all(dom.root).filter((n) => n.tagName === 'DIALOG').length, 0);
  assert.equal(f.writes().length, 0);
  tool.dispose();
  await f.editor.dispose();
});
test('source inventory keeps disabled ambiguous and nested rows without capture probing', async () => {
  const f = fixture();
  await f.open();
  const base = f.editor.getEditorState(),
    row = f.content.paragraphs[0];
  const state = Object.create(base);
  Object.defineProperty(state, 'content', {
    value: { format: 'hwp5', paragraphs: [row, { ...row }] },
  });
  assert(hwp5EquationScriptSources(state).every((r) => r.issue === 'AmbiguousHwp5EquationOwner'));
  const nested = Object.create(base);
  Object.defineProperty(nested, 'content', {
    value: { format: 'hwp5', paragraphs: [{ ...row, drawingText: {} }] },
  });
  assert.equal(hwp5EquationScriptSources(nested)[0].issue, 'UnsupportedHwp5EquationOwner');
  assert.equal(f.captures().length, 0);
  await f.editor.dispose();
});
test('Worker uses the final real JS facade and transmits only opaque Native lease plus validated script', () => {
  let payload,
    nativeCalls = 0;
  const wasm = {
    hwp5_edit_equation_script_edit_version: () => 1,
    hwp5_edit_history_revision: () => 0,
    hwp5_edit_equation_script_edit_capture(section, equationNode, layout) {
      if (layout === 0xffffffff) return new Uint8Array();
      return new TextEncoder().encode(
        JSON.stringify({
          schemaVersion: 1,
          scope: 'hwp5-equation-script-edit-capture',
          executionAuthority: false,
          lease: '18446744073709551615',
          section,
          equationNode,
          layout: layout === 0 ? 'version-only' : 'with-font',
          historyRevision: 0,
          scriptUtf16LE: [120],
          limits: {
            scriptUnits: 65535,
            scriptBytes: 262140,
            requestBytes: 1048576,
            replyBytes: 2097152,
          },
        }),
      );
    },
    hwp5_edit_equation_script_edit_commit(ptr, size) {
      nativeCalls++;
      assert.equal(ptr, 1);
      assert(size > 0);
      return 1;
    },
  };
  const api = {
    historyStats: () => ({ protocolVersion: 2 }),
    ...createHwp5EquationScriptEditApi({
      wasm,
      check() {},
      output: (fn) => ({ bytes: fn() }),
      memory: {
        withBytes(bytes, fn) {
          payload = JSON.parse(new TextDecoder().decode(bytes));
          return fn(1, bytes.length);
        },
      },
    }),
  };
  const worker = createHwp5EquationScriptCommands(
      () => api,
      () => true,
    ),
    r = worker.capture({ kind: 'hwp5-equation-script-capture', ...selector });
  assert(!JSON.stringify(r).includes('18446744073709551615'));
  assert.equal(r.script, 'x');
  const result = worker.edit({
    kind: 'hwp5-equation-script-edit',
    leaseKey: r.leaseKey,
    script: 'y\r\n😀',
  });
  assert.equal(result.application, 'applied');
  assert.equal(nativeCalls, 1);
  assert.deepEqual(payload, { schemaVersion: 1, lease: '18446744073709551615', script: 'y\r\n😀' });
  assert.throws(
    () => worker.edit({ kind: 'hwp5-equation-script-edit', leaseKey: r.leaseKey, script: 'z' }),
    /Stale/,
  );
  assert.equal(nativeCalls, 1);
});
test('queued replacement capture can succeed after the obsolete delayed reply is refused', async () => {
  let finish,
    entered,
    count = 0;
  const started = new Promise((r) => {
    entered = r;
  });
  const f = fixture({
    capture: () => {
      if (++count === 1) {
        entered();
        return new Promise((r) => {
          finish = r;
        });
      }
    },
  });
  await f.open();
  await f.select();
  const first = f.editor.getHwp5EquationScript(selector),
    rejected = assert.rejects(first, /StaleHwp5EquationScriptTarget/);
  await started;
  const second = f.editor.getHwp5EquationScript(selector);
  finish();
  await rejected;
  const current = await second;
  assert.equal(current.state, 'available');
  assert.equal(
    (
      await f.editor.dispatchCommand(EDIT_HWP5_EQUATION_SCRIPT_COMMAND, {
        target: current.target,
        script: 'z',
      })
    ).status,
    'committed-with-snapshot',
  );
  assert.equal(f.captures().length, 2);
  assert.equal(f.writes().length, 1);
  await f.editor.dispose();
});
