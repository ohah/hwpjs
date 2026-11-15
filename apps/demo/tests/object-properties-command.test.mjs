import test from 'node:test';
import assert from 'node:assert/strict';
import { connectObjectActivation } from '../src/object-activation-bridge.ts';
import { createObjectActivationRelay } from '../src/object-activation-relay.ts';
import * as nodeModule from 'node:module';
const styles = new Set(
  ['text-color.css', 'font-name.css', 'dialog-layer.css', 'document-open-ui.css'].map(
    (name) => new URL('../src/' + name, import.meta.url).href,
  ),
);
const hook = nodeModule.registerHooks?.({
  load(url, context, next) {
    return styles.has(url)
      ? { format: 'module', source: 'export {};', shortCircuit: true }
      : next(url, context);
  },
});
const { createDemoShell } = await import('../src/shell.ts');
hook?.deregister();
import { Document, all } from './fake-dom.mjs';

test('semantic property command and P/dblclick share exact current routing and token gates', () => {
  const token = {
    editorId: 'e',
    documentId: 'd',
    generation: 1,
    operationRevision: 2,
    viewRevision: 3,
  };
  const state = {
    ...token,
    token,
    status: 'ready',
    content: {
      chartTargets: [{ section: 0, wrapper: 7 }],
      pictures: [{ section: 0, pictureNode: 8 }],
    },
  };
  let properties;
  const opened = [];
  const stop = connectObjectActivation(
    {
      registerObjectPropertiesRequest(fn) {
        properties = fn;
        return () => {
          properties = null;
        };
      },
    },
    { getEditorState: () => state },
    {
      chart: { open: (t) => opened.push(t) },
      picture: { open: () => opened.push('picture') },
      drawing: { open: () => assert.fail('not selected') },
    },
  );
  properties({
    type: 'properties-command',
    target: { kind: 'chart', section: 0, wrapper: 7 },
    token,
  });
  properties({
    type: 'properties-command',
    target: { kind: 'picture', section: 0, pictureNode: 8 },
    token,
  });
  properties({
    type: 'properties-command',
    target: { kind: 'chart', section: 0, wrapper: 7 },
    token: { ...token, documentId: 'foreign' },
  });
  state.historyRecoveryRequired = true;
  properties({
    type: 'properties-command',
    target: { kind: 'chart', section: 0, wrapper: 7 },
    token,
  });
  assert.deepEqual(opened, [{ section: 0, wrapper: 7 }, 'picture']);
  stop();
  assert.equal(properties, null);
});
function host(id) {
  const controls = new Set(),
    observers = new Set();
  let requests = 0;
  return {
    id,
    controls,
    observers,
    get requests() {
      return requests;
    },
    registerObjectActivation() {
      return () => {};
    },
    getSelectedObject() {
      return id;
    },
    requestSelectedObjectProperties() {
      requests++;
      return true;
    },
    registerObjectPropertiesControl(el) {
      controls.add(el);
      return () => controls.delete(el);
    },
    subscribeObjectSelection(fn) {
      observers.add(fn);
      return () => observers.delete(fn);
    },
  };
}
test('React/Svelte relay reads only current surface and moves controls/observers across replacement', () => {
  const relay = createObjectActivationRelay(),
    a = host('a'),
    b = host('b'),
    control = {},
    fn = () => {};
  const stop = relay.registerObjectPropertiesControl(control),
    unsubscribe = relay.subscribeObjectSelection(fn);
  assert.equal(relay.getSelectedObject(), null);
  assert.equal(relay.requestSelectedObjectProperties(), false);
  relay.connect(a);
  assert.equal(relay.getSelectedObject(), 'a');
  assert.equal(relay.requestSelectedObjectProperties(), true);
  relay.connect(b);
  assert.equal(a.controls.size, 0);
  assert.equal(a.observers.size, 0);
  assert.equal(relay.getSelectedObject(), 'b');
  assert.equal(b.controls.size, 1);
  assert.equal(b.observers.size, 1);
  stop();
  unsubscribe();
  assert.equal(b.controls.size, 0);
  assert.equal(b.observers.size, 0);
  relay.dispose();
  assert.equal(relay.getSelectedObject(), null);
  assert.equal(relay.requestSelectedObjectProperties(), false);
  assert.equal(a.requests, 1);
  assert.equal(b.requests, 0);
});
test('relay rejects reentrant old surface read and cleans partial attach failure', () => {
  const relay = createObjectActivationRelay(),
    a = host('a'),
    b = host('b');
  a.getSelectedObject = () => {
    relay.connect(b);
    return 'old';
  };
  relay.connect(a);
  assert.equal(relay.getSelectedObject(), null);
  assert.equal(relay.getSelectedObject(), 'b');
  relay.registerObjectPropertiesControl({});
  relay.subscribeObjectSelection(() => {});
  const broken = host('broken');
  broken.subscribeObjectSelection = () => {
    throw Error('attach failed');
  };
  assert.throws(() => relay.connect(broken), /attach failed/);
  assert.equal(broken.controls.size, 0);
  assert.equal(b.controls.size, 0);
  assert.equal(relay.getSelectedObject(), null);
  relay.dispose();
});
test('shell admits only property buttons and their containing menu summary, not the full popup or unrelated buttons', () => {
  const doc = new Document(),
    root = doc.createElement('div');
  const shell = createDemoShell(root, {
    framework: 'vanilla',
    routes: {
      vanilla: '/demo/vanilla/',
      react: '/demo/react/',
      svelte: '/demo/svelte/',
      headless: '/demo/headless/',
    },
    fixtures: [],
    getState: () => ({
      title: 'test',
      status: 'ready',
      actions: { 'object-properties': { enabled: true } },
    }),
    onAction() {},
    onOpenFile() {},
    onOpenFixture() {},
    onError(e) {
      throw e;
    },
  });
  const targets = shell.objectPropertiesFocusTargets;
  const buttons = all(
    root,
    (n) => n.tagName === 'BUTTON' && n.dataset.command === 'object-properties',
  );
  assert.equal(buttons.length, 2);
  assert.equal(targets.length, 3);
  assert(buttons.every((n) => targets.includes(n)));
  assert.equal(targets.filter((n) => n.tagName === 'SUMMARY').length, 1);
  assert.equal(
    targets.some((n) => n.tagName === 'DETAILS' || n.tagName === 'DIV'),
    false,
  );
  shell.destroy();
});
