// Real save policy and verbatim controller save block. Fake DOM/editor; no full mount, browser or Native.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { Document, all } from './fake-dom.mjs';
const sourceRoot = new URL(
  process.env.HWPJS_SAVE_TEST_VARIANT === 'preimage' ? '../../../../preimage/' : '../../../',
  import.meta.url,
);
const { mountSavePolicy } = await import(new URL('apps/demo/src/save-policy.ts', sourceRoot));
const controller = stripTypeScriptTypes(
  fs.readFileSync(new URL('apps/demo/src/demo-controller.ts', sourceRoot), 'utf8'),
);
const marker = "    if (action.command !== 'save') throw Error('UnsupportedDemoAction');";
assert.equal(controller.split(marker).length, 2, 'unique real save branch');
const tail = controller.split(marker)[1];
assert.equal(tail.split('\n  }\n  const shell = createDemoShell').length, 2, 'unique branch end');
const saveBody = tail.split('\n  }\n  const shell = createDemoShell')[0];
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const runSave = new AsyncFunction(
  'editor',
  'savePolicy',
  'closed',
  'note',
  'root',
  'filename',
  'documentDownloadName',
  'URL',
  'Blob',
  'setTimeout',
  saveBody,
);
function harness() {
  const doc = new Document(),
    root = doc.createElement('main'),
    effects = [],
    calls = [],
    notes = [],
    listeners = new Set();
  const create = doc.createElement.bind(doc);
  doc.createElement = (tag) => {
    const node = create(tag);
    node.closest = (selector) => {
      for (let n = node; n; n = n.parentElement)
        if (selector === 'label' ? n.tagName === 'LABEL' : selector === '[hidden]' && n.hidden)
          return n;
      return null;
    };
    node.focus = (options) => {
      doc.activeElement = node;
      effects.push(['focus', options]);
    };
    node.scrollIntoView = (options) => effects.push(['scroll', options]);
    node.click = () => effects.push(['download', node.download]);
    return node;
  };
  let state = { documentId: 'doc-a', status: 'ready', content: { format: 'hwp5' } };
  let stateReadable = true,
    savedBlob;
  let behavior = async () => {
    throw new Error('LayoutReflowRequired');
  };
  const editor = {
    getEditorState: () => {
      assert.equal(stateReadable, true, 'disposed state must not be read');
      return state;
    },
    registerStateListener(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    save: async (options) => {
      calls.push(structuredClone(options));
      return behavior();
    },
  };
  const policy = mountSavePolicy(root, editor);
  const input = all(root, (n) => n.dataset.role === 'allow-stale-layout')[0];
  const unprotected = all(root, (n) => n.dataset.role === 'allow-unprotected-output')[0];
  const url = {
    createObjectURL(blob) {
      savedBlob = blob;
      effects.push(['url']);
      return 'blob:fake';
    },
    revokeObjectURL(value) {
      effects.push(['revoke', value]);
    },
  };
  return {
    doc,
    root,
    policy,
    input,
    unprotected,
    calls,
    effects,
    notes,
    listeners,
    setState(patch, publish = true) {
      state = { ...state, ...patch };
      if (publish) for (const fn of listeners) fn(state);
    },
    setBehavior(fn) {
      behavior = fn;
    },
    forbidStateReads() {
      stateReadable = false;
    },
    get savedBlob() {
      return savedBlob;
    },
    run(closed = false) {
      return runSave(
        editor,
        policy,
        closed,
        (text) => notes.push(text),
        root,
        'sample.hwp',
        (name, format) => {
          assert.equal(format, state.content.format);
          return name;
        },
        url,
        Blob,
        (callback) => callback(),
      );
    },
  };
}
function deferred() {
  let reject;
  const promise = new Promise((resolve, no) => {
    reject = no;
  });
  return { promise, reject };
}
function assertUntouched(h) {
  assert.equal(h.input.checked, false);
  assert.deepEqual(h.effects, []);
  assert.deepEqual(h.notes, []);
  assert.equal(h.calls.length, 1);
}

test('actual save rejection guides the visible consent in Korean and leaves both consent and retry to the user', async () => {
  const h = harness();
  await h.run();
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0], { allowStaleLayout: false, allowUnprotectedOutput: false });
  assert.equal(h.input.checked, false);
  assert.equal(h.doc.activeElement, h.input);
  assert.match(h.notes[0], /^저장 실패: LayoutReflowRequired/);
  assert.match(h.notes[0], /원본 배치 정보는 재계산되지 않았습니다/);
  assert.match(h.notes[0], /줄 배치가 달라질 수 있는 HWP 저장 허용/);
  assert.match(h.notes[0], /직접 선택한 뒤 다시 저장/);
  assert.deepEqual(h.effects, [
    ['focus', { preventScroll: true }],
    ['scroll', { block: 'center', inline: 'nearest' }],
  ]);
  h.policy.dispose();
});

test('only an explicit later checkbox choice permits stale layout on a second manual save', async () => {
  const h = harness();
  await h.run();
  h.input.checked = true;
  h.setBehavior(async () => ({ bytes: Uint8Array.of(1, 2), format: 'hwp5' }));
  await h.run();
  assert.deepEqual(
    h.calls.map((c) => c.allowStaleLayout),
    [false, true],
  );
  assert.equal(h.effects.filter((e) => e[0] === 'download').length, 1);
  assert.equal(h.notes.at(-1), '파일을 저장했습니다.');
  assert.equal(h.input.checked, true);
  h.policy.dispose();
});

for (const error of [
  new Error('NativeRefused'),
  new Error('prefix LayoutReflowRequired'),
  'LayoutReflowRequired',
  { message: 'LayoutReflowRequired' },
])
  test('other errors preserve original rejection identity: ' + String(error), async () => {
    const h = harness();
    h.setBehavior(async () => {
      throw error;
    });
    await assert.rejects(h.run(), (value) => value === error);
    assertUntouched(h);
    h.policy.dispose();
  });

const refusals = [
  ['HWPX', (h) => h.setState({ content: { format: 'hwpx' } })],
  ['missing format', (h) => h.setState({ content: {} })],
  ['loading', (h) => h.setState({ status: 'loading' })],
  ['error status', (h) => h.setState({ status: 'error' })],
  [
    'disabled checkbox',
    (h) => {
      h.input.disabled = true;
    },
  ],
  [
    'hidden label',
    (h) => {
      h.input.parentElement.hidden = true;
    },
  ],
  [
    'hidden checkbox',
    (h) => {
      h.input.hidden = true;
    },
  ],
  [
    'hidden ancestor',
    (h) => {
      h.root.hidden = true;
    },
  ],
  ['missing document', (h) => h.setState({ documentId: null })],
];
for (const [name, setup] of refusals)
  test(name + ' preserves the generic error path without focus or download', async () => {
    const h = harness();
    setup(h);
    const error = new Error('LayoutReflowRequired');
    h.setBehavior(async () => {
      throw error;
    });
    await assert.rejects(h.run(), (value) => value === error);
    assertUntouched(h);
    h.policy.dispose();
  });

for (const [name, change] of [
  ['document replacement', (h) => h.setState({ documentId: 'doc-b' })],
  ['loading without listener notification', (h) => h.setState({ status: 'loading' }, false)],
  [
    'format changed without listener notification',
    (h) => h.setState({ content: { format: 'hwpx' } }, false),
  ],
  [
    'policy disposal',
    (h) => {
      h.policy.dispose();
      h.forbidStateReads();
    },
  ],
])
  test('awaited rejection after ' + name + ' never guides stale controls', async () => {
    const h = harness(),
      pending = deferred(),
      error = new Error('LayoutReflowRequired');
    h.setBehavior(() => pending.promise);
    const running = h.run();
    change(h);
    pending.reject(error);
    await assert.rejects(running, (value) => value === error);
    assertUntouched(h);
    h.policy.dispose();
  });

test('closed controller preserves rejection and never calls policy guidance', async () => {
  const h = harness();
  h.policy.failureGuidance = () => assert.fail('closed controller must not guide');
  await assert.rejects(h.run(true), /LayoutReflowRequired/);
  assertUntouched(h);
  h.policy.dispose();
});

for (const format of ['hwp5', 'hwpx'])
  test(
    format + ' successful save retains filename, bytes, single download and success status',
    async () => {
      const h = harness();
      h.setState({ content: { format } });
      h.setBehavior(async () => ({ bytes: Uint8Array.of(1, 2), format }));
      await h.run();
      assert.equal(h.calls.length, 1);
      assert.equal(h.input.checked, false);
      assert.deepEqual(h.effects, [['url'], ['download', 'sample.hwp'], ['revoke', 'blob:fake']]);
      assert.deepEqual(h.notes, ['파일을 저장했습니다.']);
      assert.deepEqual(new Uint8Array(await h.savedBlob.arrayBuffer()), Uint8Array.of(1, 2));
      assert.equal(h.savedBlob.type, 'application/octet-stream');
      h.policy.dispose();
    },
  );

test('per-document and encryption consent visibility, disabled states and disposal contract remain intact', () => {
  const h = harness();
  h.input.checked = true;
  h.unprotected.checked = true;
  h.setState({ content: { format: 'hwp5', passwordProtectionRemoved: true } });
  assert.deepEqual(h.policy.options(), { allowStaleLayout: true, allowUnprotectedOutput: true });
  h.setState({ status: 'loading' });
  assert.equal(h.input.disabled, true);
  assert.equal(h.unprotected.disabled, true);
  assert.deepEqual(h.policy.options(), { allowStaleLayout: false, allowUnprotectedOutput: false });
  h.setState({ documentId: 'doc-b', status: 'ready', content: { format: 'hwpx' } });
  assert.equal(h.input.checked, false);
  assert.equal(h.unprotected.checked, false);
  assert.equal(h.input.parentElement.hidden, true);
  assert.equal(h.unprotected.parentElement.hidden, true);
  h.policy.dispose();
  assert.equal(h.listeners.size, 0);
  assert.equal(h.root.children.length, 0);
});
