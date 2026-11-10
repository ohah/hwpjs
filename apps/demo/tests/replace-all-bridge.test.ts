import test from 'node:test';
import assert from 'node:assert/strict';
import { REPLACE_ALL_COMMAND } from '@hwpjs/core';
import { createTextToolsBridge } from '../src/text-tools-bridge.ts';
import { documentFixture, all, fire } from './text-tools-presentation-dom.ts';
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function setup(options: any = {}) {
  const { root } = documentFixture(),
    calls: any[] = [],
    statuses: string[] = [];
  const state = {
    status: 'ready',
    documentId: 'd',
    generation: 1,
    stateVersion: 7,
    token: { editorId: 'e', documentId: 'd', generation: 1, operationRevision: 0, viewRevision: 0 },
  };
  let resolveCap: any;
  const editor: any = {
    getEditorState: () => state,
    registerStateListener: () => () => {},
    getReplaceAllCapabilities: () =>
      options.pendingCap
        ? new Promise((resolve) => (resolveCap = resolve))
        : Promise.resolve({ available: options.available ?? true, supportsNewlines: false }),
    async update(fn: any) {
      calls.push('barrier');
      fn();
    },
    async dispatchCommand(command: any, payload: any) {
      calls.push({ command, payload });
      return { status: options.status ?? 'committed-with-snapshot', state };
    },
  };
  const bridge = createTextToolsBridge({
    editor,
    root: root as any,
    onStatus: (m) => statuses.push(m),
  });
  await bridge.action({ command: 'replace' });
  const role = (name: string) => {
    const node = all(root).find((n) => n.dataset.role === name);
    assert(node, name);
    return node;
  };
  role('search-query').value = '국민';
  fire(role('search-query'), 'input');
  role('search-replacement').value = '시민';
  fire(role('search-replacement'), 'input');
  return {
    bridge,
    role,
    calls,
    statuses,
    resolveCap: () => resolveCap({ available: true, supportsNewlines: false }),
  };
}
test('Native capability gates ReplaceAll and click emits one typed command after input barrier', async () => {
  const h = await setup();
  try {
    await tick();
    assert.equal(h.role('replace-all').disabled, false);
    h.calls.length = 0;
    fire(h.role('replace-all'), 'click');
    assert.equal(h.role('replace-all').disabled, true);
    await tick();
    await tick();
    assert.equal(h.calls[0], 'barrier');
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[1].command, REPLACE_ALL_COMMAND);
    assert.equal(h.calls[1].payload.query, '국민');
    assert.equal(h.calls[1].payload.replacement, '시민');
    assert.equal(h.calls[1].payload.stateVersion, 7);
    assert.match(h.role('search-status').textContent, /문서 전체/);
    assert.equal(h.role('replace-all').disabled, false);
  } finally {
    h.bridge.dispose();
  }
});
test('old Native stays disabled and late capability does not recreate a closed dialog', async () => {
  const h = await setup({ available: false });
  try {
    await tick();
    assert.equal(h.role('replace-all').disabled, true);
    assert.deepEqual(h.calls, ['barrier']);
  } finally {
    h.bridge.dispose();
  }
  const late = await setup({ pendingCap: true });
  await tick();
  late.calls.length = 0;
  fire(late.role('close-text-tool'), 'click');
  late.resolveCap();
  await tick();
  assert.equal(late.calls.length, 0);
  late.bridge.dispose();
});
test('zero matches has a distinct no-change result', async () => {
  const h = await setup({ status: 'known-no-op' });
  try {
    await tick();
    fire(h.role('replace-all'), 'click');
    await tick();
    assert.match(h.role('search-status').textContent, /바뀐 내용이 없습니다/);
  } finally {
    h.bridge.dispose();
  }
});
