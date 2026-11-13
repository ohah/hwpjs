import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEquationTool } from '../src/equation-tool.ts';
import { createEquationView } from '../src/equation-view.ts';
import { createEquationPort } from '../src/equation-port.ts';
import { fixture, dom, tick } from './equation-fixture.mjs';
const find = (root, predicate) => {
  if (predicate(root)) return root;
  for (const child of root.children ?? []) {
    const found = find(child, predicate);
    if (found) return found;
  }
};
const button = (root, text) => find(root, (n) => n.tagName === 'BUTTON' && n.textContent === text);
function setup() {
  const f = fixture(),
    { root } = dom();
  let port;
  const view = createEquationView(root, {
    ready: () => port.ready(),
    request: (m) => port.request(m),
    onDismiss() {},
  });
  port = createEquationPort(f.editor, {
    receive: (m) => view.message(m),
    invalidate: () => view.destroy(),
  });
  port.enable();
  view.show();
  return { f, root, view, port };
}
test('actual reused controls list→query chain, script draft, unchanged submit, two writes with fresh revisions', async () => {
  const { f, root, view, port } = setup();
  await tick();
  const form = find(root, (n) => n.tagName === 'FORM'),
    input = find(root, (n) => n.tagName === 'TEXTAREA');
  assert.deepEqual(
    f.calls.map((c) => c.message.kind),
    ['equation-sources', 'equation-script-query'],
  );
  assert.equal(input.value, 'a + b');
  form.fire('submit');
  await tick();
  assert.equal(f.calls.length, 2);
  for (const [index, value] of ['x < y\r\n한글', 'z'].entries()) {
    input.value = value;
    input.fire('input');
    form.fire('submit');
    await tick();
    const call = f.calls.at(-1);
    assert.equal(call.message.expectedRevision, index);
    assert.equal(call.message.value, value);
    assert.equal(input.value, value);
  }
  port.close();
  view.destroy();
});
test('source issue rows remain disabled and malformed inventory cannot grant a write lease', async () => {
  for (const sources of [
    [{ node: 3, script_node: null, script_count: 0, active: true, issue: 'missing_script' }],
    [
      { node: 3, script_node: 4, script_count: 1, active: true, issue: null },
      { node: 3, script_node: 5, script_count: 1, active: true, issue: null },
    ],
  ]) {
    const f = fixture(),
      { root } = dom();
    f.sources.splice(0, f.sources.length, ...sources);
    let port;
    const view = createEquationView(root, {
      ready: () => port.ready(),
      request: (m) => port.request(m),
      onDismiss() {},
    });
    port = createEquationPort(f.editor, { receive: (m) => view.message(m), invalidate() {} });
    port.enable();
    view.show();
    await tick();
    find(root, (n) => n.tagName === 'FORM').fire('submit');
    await tick();
    assert.deepEqual(
      f.calls.map((c) => c.message.kind),
      ['equation-sources'],
    );
    assert.equal(find(root, (n) => n.tagName === 'FIELDSET').disabled, true);
    port.close();
    view.destroy();
  }
});
test('IME composition blocks submit; refresh discards draft and destroy removes handlers', async () => {
  const { f, root, view, port } = setup();
  await tick();
  const form = find(root, (n) => n.tagName === 'FORM'),
    input = find(root, (n) => n.tagName === 'TEXTAREA');
  input.value = 'draft';
  input.fire('input');
  form.fire('compositionstart');
  form.fire('submit');
  await tick();
  assert.equal(f.calls.length, 2);
  form.fire('compositionend');
  button(root, '현재 script 다시 조회').fire('click');
  await tick();
  assert.equal(input.value, 'a + b');
  view.destroy();
  view.destroy();
  form.fire('submit');
  input.fire('input');
  await tick();
  assert.equal(f.calls.length, 3);
  assert.equal(root.children.length, 0);
  port.close();
});
test('IME keyCode229 without compositionstart cannot submit a draft', async () => {
  const { f, root, view, port } = setup();
  await tick();
  const form = find(root, (n) => n.tagName === 'FORM');
  const input = find(root, (n) => n.tagName === 'TEXTAREA');
  const dialog = find(root, (n) => n.tagName === 'DIALOG');
  input.value = 'draft';
  input.fire('input');
  const event = new Event('keydown');
  Object.defineProperty(event, 'keyCode', { value: 229 });
  dialog.dispatchEvent(event);
  form.fire('submit');
  await tick();
  assert.equal(f.calls.length, 2);
  dialog.fire('keyup');
  form.fire('submit');
  await tick();
  assert.equal(f.calls.at(-1).message.value, 'draft');
  port.close();
  view.destroy();
});
test('existing 64-row pagination keeps immutable source node identities across pages', async () => {
  const f = fixture(),
    { root } = dom();
  let port;
  f.sources.splice(
    0,
    1,
    ...Array.from({ length: 65 }, (_, i) => ({
      node: i * 2 + 3,
      script_node: i * 2 + 4,
      script_count: 1,
      active: true,
      issue: null,
    })),
  );
  const view = createEquationView(root, {
    ready: () => port.ready(),
    request: (m) => port.request(m),
    onDismiss() {},
  });
  port = createEquationPort(f.editor, { receive: (m) => view.message(m), invalidate() {} });
  port.enable();
  view.show();
  await tick();
  const select = find(root, (n) => n.tagName === 'SELECT');
  assert.equal(select.children.length, 64);
  button(root, '다음 목록').fire('click');
  await tick();
  assert.equal(select.children.length, 1);
  assert.equal(f.calls.at(-1).message.node, 131);
  button(root, '이전 목록').fire('click');
  await tick();
  assert.equal(f.calls.at(-1).message.node, 3);
  port.close();
  view.destroy();
});
test('tool presentation gates, duplicate open, state-change close, reopen and dispose cleanup', async () => {
  const f = fixture(),
    { root } = dom(),
    views = [],
    statuses = [];
  let closes = 0;
  const tool = createEquationTool({
    root,
    editor: f.editor,
    onStatus: (m) => statuses.push(m),
    onClose: () => closes++,
    createView: (_root, callbacks) => {
      const view = {
        messages: [],
        destroyed: 0,
        show() {},
        message(m) {
          this.messages.push(m);
        },
        destroy() {
          this.destroyed++;
        },
        callbacks,
      };
      views.push(view);
      return view;
    },
  });
  assert.equal(tool.presentation().enabled, true);
  tool.open();
  tool.open();
  assert.equal(views.length, 1);
  assert.equal(tool.presentation().enabled, false);
  views[0].callbacks.onDismiss();
  assert.equal(closes, 1);
  assert.equal(f.listeners.size, 0);
  tool.open();
  f.replace({ generation: 2 });
  assert.equal(views[1].destroyed, 1);
  assert.equal(closes, 1);
  assert.equal(statuses.length, 1);
  tool.open();
  tool.dispose();
  tool.dispose();
  assert.equal(views[2].destroyed, 1);
  assert.equal(f.listeners.size, 0);
  assert.equal(tool.presentation().enabled, false);
  await tick();
});
test('late replies from closed session cannot reach a reopened tool view', async () => {
  const f = fixture(),
    { root } = dom(),
    views = [];
  let resolve;
  f.editor.readResource = (m) =>
    new Promise((r) => {
      resolve = () => r(f.reply(m));
    });
  const tool = createEquationTool({
    root,
    editor: f.editor,
    onStatus() {},
    onClose() {},
    createView: (_r, callbacks) => {
      const view = {
        callbacks,
        messages: [],
        message(m) {
          this.messages.push(m);
        },
        show() {},
        destroy() {},
      };
      views.push(view);
      return view;
    },
  });
  tool.open();
  views[0].callbacks.request({ kind: 'equation-sources', section: 0, requestId: 1 });
  await tick();
  views[0].callbacks.onDismiss();
  tool.open();
  resolve();
  await tick();
  assert.deepEqual(
    views[1].messages.map((m) => m.kind),
    ['enable'],
  );
  tool.dispose();
});
