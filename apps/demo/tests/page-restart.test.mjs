import { checkedPageRestartInventory } from '../../../packages/core/src/commands/page-restart.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor, EDIT_PAGE_RESTART_COMMAND } from '../../../packages/core/src/index.ts';
import { bindRuntimeAdmission } from '../../../packages/core/src/internal/runtime-admission.ts';
import { createPageRestartCommands } from '../../../web/preview/page-restart-command.mjs';
import { installFormattingTestStyles } from './formatting-style-preload.mjs';
import { documentFixture, fire, all } from './formatting-dialog-test-dom.ts';
const styles = installFormattingTestStyles();
const { createPageRestartTool } = await import('../src/page-restart-tool.ts');
styles.deregister();
// Controlled runtime/facade doubles only, not Native observation or document evidence.
function backend(format = 'hwpx') {
  let revision = 0,
    serial = 0,
    sequence = 0,
    writes = 0,
    nativeCalls = 0;
  let issued = new WeakSet();
  const api = {
    historyStats: () => ({ protocolVersion: 2 }),
    historyRevision: () => revision,
    ownsPageRestartObservation: (value) => issued.has(value),
    pageRestartCapabilities() {
      issued = new WeakSet();
      // Each query issues a new opaque object. Equality with a later query is not current authority.
      const observation = Object.freeze({
        revision: String(revision),
        serial: String(serial),
        lease: String(++sequence),
        session: 'own-test',
      });
      issued.add(observation);
      return {
        schemaVersion: 1,
        format,
        binding: { session: 'own-test', revision: String(revision), serial: String(serial) },
        rows: [
          { section: 0, controlNode: 7, paragraph: 1, number: 3, observation },
          { section: 0, controlNode: null, paragraph: null, reason: 'UnsupportedPageRestartOwner' },
        ],
      };
    },
    writePageRestart(request) {
      nativeCalls++;
      assert(issued.has(request.before), 'Native receives the original issuer-owned object');
      if (request.before.serial !== String(serial))
        return {
          application: 'unapplied',
          nativeCode: 0,
          changed: false,
          error: 'StalePageRestartBinding',
        };
      writes++;
      if (request.number !== 3) revision++;
      return {
        application: request.number === 3 ? 'unapplied' : 'applied',
        nativeCode: request.number === 3 ? 2 : 1,
        changed: request.number !== 3,
      };
    },
  };
  return {
    api,
    writes: () => writes,
    nativeCalls: () => nativeCalls,
    expire: () => {
      serial++;
    },
  };
}
function fixture(format = 'hwpx', available = true, extra = {}) {
  let revision = 0,
    closed = false;
  const calls = [],
    content = {
      format,
      paragraphs: [
        { section: 0, paragraph: 0, text: 'own', editable: true, selectionOwner: 'section:0:body' },
      ],
      ...extra.content,
    };
  const runtime = {
    async request(message, context) {
      calls.push(message);
      if (message.kind === 'edit-page-restart' && message.number !== 3) revision++;
      return {
        kind: message.kind,
        historyRevision: revision,
        historyRevisions: [revision],
        historyStats: { protocolVersion: extra.protocol ?? 2 },
        meta: {
          context,
          application:
            message.kind === 'edit-page-restart' && message.number === 3 ? 'unapplied' : 'applied',
          changed: message.kind === 'edit-page-restart' && message.number !== 3,
        },
        ...(message.kind === 'page-restarts-query'
          ? {
              pageRestarts: {
                schemaVersion: 1,
                format,
                revision,
                entries: [
                  { section: 0, controlNode: 7, paragraph: 1, number: 3, leaseKey: 'private' },
                ],
                unavailable: [
                  {
                    section: 0,
                    controlNode: null,
                    paragraph: null,
                    reason: 'UnsupportedPageRestartOwner',
                  },
                ],
              },
            }
          : { content }),
      };
    },
    dispose() {
      closed = true;
    },
  };
  if (available)
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
    runtime,
    calls,
    open: () => editor.load(new Uint8Array([1]), { format }),
    writes: () => calls.filter((m) => m.kind === 'edit-page-restart'),
  };
}
test('Core query owns distinct opaque targets, hides leases and preserves unavailable rows for both formats', async () => {
  for (const format of ['hwp5', 'hwpx']) {
    const f = fixture(format);
    await f.open();
    const read = await f.editor.getPageRestarts();
    assert.equal(read.state, 'available');
    assert.equal(read.entries.length, 1);
    assert.equal(read.unavailable[0].reason, 'UnsupportedPageRestartOwner');
    assert.equal(read.unavailable[0].controlNode, null);
    assert(!JSON.stringify(read).includes('private'));
    assert(!('observation' in read.entries[0]));
    assert(Object.isFrozen(read.entries[0].target));
    await f.editor.dispose();
  }
  const unavailable = Array.from({ length: 20000 }, (_, controlNode) => ({
    section: 0,
    controlNode,
    paragraph: null,
    reason: 'x'.repeat(256),
  }));
  const packet = { schemaVersion: 1, format: 'hwpx', revision: 0, entries: [], unavailable };
  assert.equal(checkedPageRestartInventory(packet, 'hwpx', 0).unavailable.length, 20000);
  assert.throws(
    () =>
      checkedPageRestartInventory(
        {
          ...packet,
          unavailable: [
            ...unavailable,
            { section: 1, controlNode: 0, paragraph: null, reason: 'unsupported' },
          ],
        },
        'hwpx',
        0,
      ),
    /InvalidPageRestartInventory/,
  );
  assert.throws(
    () =>
      checkedPageRestartInventory(
        {
          ...packet,
          unavailable: [
            { section: 0, controlNode: null, paragraph: null, reason: 'x'.repeat(257) },
          ],
        },
        'hwpx',
        0,
      ),
    /InvalidPageRestartInventory/,
  );
});
test('Core rejects cloned and foreign targets, invalid numbers and extra witness fields before mutation', async () => {
  const f = fixture(),
    other = fixture();
  await f.open();
  await other.open();
  const read = await f.editor.getPageRestarts(),
    target = read.entries[0].target;
  for (const wrong of [{ ...target }, (await other.editor.getPageRestarts()).entries[0].target]) {
    assert.equal(
      (await f.editor.dispatchCommand(EDIT_PAGE_RESTART_COMMAND, { target: wrong, number: 8 }))
        .status,
      'rejected-unapplied',
    );
  }
  for (const number of [0, -0, -1, 65536, 1.5, NaN, '7'])
    await assert.rejects(async () =>
      f.editor.dispatchCommand(EDIT_PAGE_RESTART_COMMAND, { target, number }),
    );
  await assert.rejects(async () =>
    f.editor.dispatchCommand(EDIT_PAGE_RESTART_COMMAND, { target, number: 7, before: {} }),
  );
  assert.equal(f.writes().length, 0);
  await f.editor.dispose();
  await other.editor.dispose();
});
test('Core FIFO commits exactly one edit and refuses queued same-state second target without retargeting', async () => {
  const f = fixture();
  await f.open();
  const target = (await f.editor.getPageRestarts()).entries[0].target;
  const a = f.editor.dispatchCommand(EDIT_PAGE_RESTART_COMMAND, { target, number: 8 });
  const b = f.editor.dispatchCommand(EDIT_PAGE_RESTART_COMMAND, { target, number: 9 });
  assert.equal((await a).status, 'committed-with-snapshot');
  assert.equal((await b).status, 'rejected-unapplied');
  assert.deepEqual(f.writes(), [{ kind: 'edit-page-restart', leaseKey: 'private', number: 8 }]);
  assert.equal(
    (await f.editor.dispatchCommand(EDIT_PAGE_RESTART_COMMAND, { target, number: 10 })).status,
    'rejected-unapplied',
  );
  await f.editor.dispose();
});
test('Core typed operations cannot be reached through experimental or resource channels', async () => {
  const f = fixture();
  await f.open();
  for (const kind of ['page-restarts-query', 'edit-page-restart']) {
    await assert.rejects(
      async () =>
        f.editor.requestExperimental({ kind }, { mutation: kind === 'edit-page-restart' }),
      /UseTypedEditorOperation/,
    );
    await assert.rejects(f.editor.readResource({ kind }), /UseTypedEditorOperation/);
  }
  assert.equal(f.calls.filter((m) => m.kind === 'page-restarts-query').length, 0);
  await f.editor.dispose();
});
test('Core unavailable admission never queries a custom runtime', async () => {
  const f = fixture('hwpx', false);
  await f.open();
  await assert.rejects(f.editor.getPageRestarts(), /UnsupportedAtomicRuntime/);
  assert.equal(f.calls.filter((m) => m.kind === 'page-restarts-query').length, 0);
  await f.editor.dispose();
});
test('runtime closure keeps observations private, scopes leases and consumes exactly once', () => {
  const f = backend(),
    commands = createPageRestartCommands(
      () => f.api,
      () => true,
    ),
    read = commands.query();
  assert.equal(read.entries.length, 1);
  const fresh = commands.query(); // SDK query replaces its private issuer set.
  assert(!JSON.stringify(read).includes('serial'));
  assert.equal(read.unavailable.length, 1);
  assert.throws(
    () =>
      commands.apply({ kind: 'edit-page-restart', leaseKey: read.entries[0].leaseKey, number: 7 }),
    /Stale/,
  );
  assert.equal(f.nativeCalls(), 0);
  assert.equal(
    commands.apply({ kind: 'edit-page-restart', leaseKey: fresh.entries[0].leaseKey, number: 7 })
      .application,
    'applied',
  );
  assert.throws(
    () =>
      commands.apply({ kind: 'edit-page-restart', leaseKey: fresh.entries[0].leaseKey, number: 8 }),
    /Foreign/,
  );
  assert.equal(f.writes(), 1);
});
test('runtime retains issuer identity and Native refuses same-revision stale leases; foreign keys refuse', () => {
  const f = backend();
  let active = f.api;
  const commands = createPageRestartCommands(
      () => active,
      () => true,
    ),
    key = commands.query().entries[0].leaseKey;
  f.expire();
  const stale = commands.apply({ kind: 'edit-page-restart', leaseKey: key, number: 7 });
  assert.equal(stale.error, 'StalePageRestartBinding');
  assert.equal(stale.nativeCode, 0);
  assert.equal(f.nativeCalls(), 1);
  assert.equal(f.writes(), 0);
  const next = commands.query().entries[0].leaseKey;
  active = backend().api;
  assert.throws(
    () => commands.apply({ kind: 'edit-page-restart', leaseKey: next, number: 7 }),
    /Foreign/,
  );
});
test('runtime no-op remains a Native result and cannot accept supplied observations', () => {
  const f = backend(),
    commands = createPageRestartCommands(
      () => f.api,
      () => true,
    ),
    key = commands.query().entries[0].leaseKey;
  assert.throws(
    () => commands.apply({ kind: 'edit-page-restart', leaseKey: key, number: 3, before: {} }),
    /InvalidPageRestartRequest/,
  );
  assert.equal(
    commands.apply({ kind: 'edit-page-restart', leaseKey: key, number: 3 }).nativeCode,
    2,
  );
  assert.equal(f.api.historyRevision(), 0);
});
test('runtime absent backend is unavailable and repeated source owners refuse', () => {
  assert.throws(
    () =>
      createPageRestartCommands(
        () => ({}),
        () => true,
      ).query(),
    /Unavailable/,
  );
  const f = backend();
  const read = f.api.pageRestartCapabilities;
  f.api.pageRestartCapabilities = () => {
    const cap = read.call(f.api);
    cap.rows.push(cap.rows[0]);
    return cap;
  };
  assert.throws(
    () =>
      createPageRestartCommands(
        () => f.api,
        () => true,
      ).query(),
    /Ambiguous/,
  );
  assert.equal(f.writes(), 0);
  const counterfeit = backend(),
    original = counterfeit.api.pageRestartCapabilities;
  counterfeit.api.pageRestartCapabilities = () => {
    const cap = original();
    cap.rows[0].observation = Object.freeze({ ...cap.rows[0].observation });
    return cap;
  };
  assert.throws(
    () =>
      createPageRestartCommands(
        () => counterfeit.api,
        () => true,
      ).query(),
    /InvalidPageRestartInventory/,
  );
  assert.equal(counterfeit.nativeCalls(), 0);
});
test('UI uses existing choices and form submit for one exact edit, preserving unavailable reasons', async () => {
  const f = fixture();
  await f.open();
  const dom = documentFixture(),
    statuses = [];
  const tool = createPageRestartTool({
    root: dom.root,
    editor: f.editor,
    onStatus: (s) => statuses.push(s),
    onClose() {},
  });
  await tool.open();
  const nodes = all(dom.root),
    input = nodes.find((n) => n.getAttribute('aria-label') === '다시 시작할 쪽 번호'),
    form = nodes.find((n) => n.tagName === 'FORM');
  assert.equal(input.value, '3');
  assert(nodes.some((n) => n.textContent.includes('기존 컨트롤의 구조나 번호')));
  input.value = '12';
  fire(form, 'submit');
  fire(form, 'submit');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.writes().length, 1);
  assert.equal(f.writes()[0].number, 12);
  assert.match(statuses[0], /변경/);
  tool.dispose();
  await f.editor.dispose();
});
test('UI invalid number cannot mutate and close during query discards the late result', async () => {
  const f = fixture();
  await f.open();
  const dom = documentFixture();
  const tool = createPageRestartTool({
    root: dom.root,
    editor: f.editor,
    onStatus() {},
    onClose() {},
  });
  await tool.open();
  const nodes = all(dom.root),
    input = nodes.find((n) => n.tagName === 'INPUT'),
    form = nodes.find((n) => n.tagName === 'FORM');
  for (const value of ['', '0', '65536', '1.5', '-1', '1e2']) {
    input.value = value;
    fire(form, 'submit');
  }
  assert.equal(f.writes().length, 0);
  tool.dispose();
  await f.editor.dispose();
  let resolve;
  const g = fixture();
  await g.open();
  const delayed = new Promise((r) => {
      resolve = r;
    }),
    editor = { ...g.editor, getPageRestarts: () => delayed };
  const d = documentFixture(),
    late = createPageRestartTool({ root: d.root, editor, onStatus() {}, onClose() {} });
  const pending = late.open();
  late.dispose();
  resolve({ state: 'available', format: 'hwpx', entries: [], unavailable: [] });
  await pending;
  assert(!all(d.root).some((n) => n.dataset.role === 'page-restart-dialog'));
  await g.editor.dispose();
});

test('Core protocol1 readonly limited and window projections never issue an edit query', async () => {
  for (const extra of [
    { protocol: 1 },
    { content: { readOnly: true } },
    { content: { limited: true } },
    { content: { window: {} } },
  ]) {
    const f = fixture('hwp5', true, extra);
    await f.open();
    assert.equal((await f.editor.getPageRestarts()).state, 'unavailable');
    assert.equal(f.calls.filter((m) => m.kind === 'page-restarts-query').length, 0);
    assert.equal(f.writes().length, 0);
    await f.editor.dispose();
  }
});
test('Core fresh no-op consumes only its target and a new read remains usable', async () => {
  const f = fixture();
  await f.open();
  const read = await f.editor.getPageRestarts();
  const result = await f.editor.dispatchCommand(EDIT_PAGE_RESTART_COMMAND, {
    target: read.entries[0].target,
    number: 3,
  });
  assert.equal(result.status, 'known-no-op');
  assert.equal(result.state.nativeHistoryRevision, 0);
  assert.equal(
    (
      await f.editor.dispatchCommand(EDIT_PAGE_RESTART_COMMAND, {
        target: read.entries[0].target,
        number: 8,
      })
    ).status,
    'rejected-unapplied',
  );
  const next = await f.editor.getPageRestarts();
  assert.equal(next.state, 'available');
  assert.equal(
    (
      await f.editor.dispatchCommand(EDIT_PAGE_RESTART_COMMAND, {
        target: next.entries[0].target,
        number: 8,
      })
    ).status,
    'committed-with-snapshot',
  );
  await f.editor.dispose();
});
test('UI number composition never submits a partial draft', async () => {
  const f = fixture();
  await f.open();
  const d = documentFixture(),
    tool = createPageRestartTool({ root: d.root, editor: f.editor, onStatus() {}, onClose() {} });
  await tool.open();
  const input = all(d.root).find((n) => n.tagName === 'INPUT'),
    form = all(d.root).find((n) => n.tagName === 'FORM'),
    layer = d.role('page-restart-dialog');
  input.value = '12';
  fire(layer, 'compositionstart');
  fire(form, 'submit');
  assert.equal(f.writes().length, 0);
  fire(layer, 'compositionend');
  fire(form, 'submit');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(f.writes().length, 1);
  tool.dispose();
  await f.editor.dispose();
});
