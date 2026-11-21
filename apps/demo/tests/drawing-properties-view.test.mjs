import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { Document, all } from './fake-dom.mjs';
const css = new URL('../src/dialog-layer.css', import.meta.url).href;
const hook = registerHooks({
  load(url, context, next) {
    if (url === css) return { format: 'module', source: 'export {};', shortCircuit: true };
    return next(url, context);
  },
});
const { createDrawingPropertiesView } = await import('../src/drawing-properties-view.ts');
const { createDrawingPropertiesTool } = await import('../src/drawing-properties-tool.ts');
hook.deregister();
function dom() {
  const doc = new Document();
  doc.defaultView = Object.assign(new EventTarget(), { innerWidth: 900, innerHeight: 700 });
  const create = doc.createElement.bind(doc);
  doc.createElement = (tag) => {
    const n = create(tag);
    n.style = {};
    n.showModal = () => {
      n.open = true;
    };
    n.close = () => {
      n.open = false;
    };
    Object.defineProperty(n, 'innerHTML', {
      set() {
        throw Error('UnsafeHTML');
      },
    });
    return n;
  };
  return { doc, root: doc.createElement('main') };
}
test('view uses shared modal chrome, textContent and display-only values; no edit controls or inferred geometry', () => {
  const { root } = dom();
  let dismissed = 0;
  const capture = {
    target: { section: 87654, drawingNode: 76543 },
    fields: [{ label: '너비', value: '25.4 mm' }],
    text: '<script>alert(1)</script>\nline2',
    textTruncated: true,
  };
  const v = createDrawingPropertiesView(root, capture, () => dismissed++);
  v.show();
  const dialogs = all(root, (n) => n.tagName === 'DIALOG');
  assert.equal(dialogs.length, 1);
  assert.equal(dialogs[0].dataset.role, 'drawing-properties');
  assert.equal(dialogs[0].dataset.mode, 'modal');
  assert.equal(dialogs[0].getAttribute('aria-modal'), 'true');
  assert(dialogs[0].open);
  assert.equal(
    all(root, (n) => ['INPUT', 'TEXTAREA', 'SELECT', 'FORM'].includes(n.tagName)).length,
    0,
  );
  const pre = all(root, (n) => n.tagName === 'PRE')[0];
  assert.equal(pre.textContent, capture.text);
  assert(root.textContent.includes('일부만 표시'));
  assert(root.textContent.includes('너비'));
  assert.equal(dialogs[0].getAttribute('aria-label'), '개체 속성');
  assert(!/HWPUNIT|text_wrap|text_flow|원값|노드|구역|미관측|87654|76543/.test(root.textContent));
  assert(root.textContent.includes('변경할 수 없습니다'));
  assert(root.textContent.includes('높이 정보를 확인할 수 없습니다.'));
  const buttons = all(root, (n) => n.tagName === 'BUTTON');
  assert.deepEqual(
    buttons.map((n) => n.textContent),
    ['×', '닫기'],
  );
  buttons[1].dispatchEvent(new Event('click'));
  assert.equal(dismissed, 1);
  v.destroy();
  v.destroy();
  assert.equal(root.children.length, 0);
  buttons[1].dispatchEvent(new Event('click'));
  assert.equal(dismissed, 1, 'disposed listener removed');
});
test('tool target-only API reads current source without host or mutation APIs and closes on doc replacement', () => {
  const { root } = dom(),
    listeners = new Set();
  const token = {
    editorId: 'e',
    documentId: 'd',
    generation: 0,
    operationRevision: 0,
    viewRevision: 0,
  };
  let state = {
    ...token,
    token,
    status: 'ready',
    stateVersion: 0,
    content: {
      format: 'hwpx',
      readOnly: true,
      drawings: [
        {
          section: 0,
          drawingNode: 5,
          hostParagraph: 0,
          anchorUnit: 0,
          source: {
            drawing_node: 5,
            paragraph: 1,
            anchor_unit: 0,
            geometry: { width: 7200, height: 3600, width_relative: 4, height_relative: 2 },
          },
        },
      ],
    },
  };
  let presentations = 0;
  const tool = createDrawingPropertiesTool({
    root,
    onPresentationChange() {
      presentations++;
    },
    editor: {
      getEditorState: () => state,
      registerStateListener(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      requestExperimental() {
        throw Error('NoWrites');
      },
      dispatchCommand() {
        throw Error('NoWrites');
      },
    },
  });
  assert.equal(tool.open({ section: 0, drawingNode: 5 }), undefined);
  assert.equal(root.children.length, 1);
  assert.equal(presentations, 1);
  state = { ...state, status: 'loading' };
  for (const fn of listeners) fn(state);
  assert.equal(root.children.length, 0);
  assert.equal(presentations, 2);
  tool.dispose();
  assert.equal(listeners.size, 0);
  assert.equal(tool.open({ section: 0, drawingNode: 5 }), undefined);
});
test('unknown sizes and absent content use plain unavailable wording, with no internal target identifiers', () => {
  const { root } = dom();
  const v = createDrawingPropertiesView(
    root,
    {
      target: { section: 87654, drawingNode: 76543 },
      fields: [],
      text: null,
      textTruncated: false,
    },
    () => {},
  );
  v.show();
  assert(root.textContent.includes('너비 정보를 확인할 수 없습니다.'));
  assert(root.textContent.includes('높이 정보를 확인할 수 없습니다.'));
  assert(root.textContent.includes('내용 정보를 확인할 수 없습니다.'));
  assert(!/87654|76543|미관측|원값|HWPUNIT|노드|구역/.test(root.textContent));
  assert.equal(all(root, (n) => n.tagName === 'PRE').length, 0);
  v.destroy();
});
test('an observed empty textbox is distinguished from unavailable content', () => {
  const { root } = dom();
  const v = createDrawingPropertiesView(
    root,
    { target: { section: 0, drawingNode: 5 }, fields: [], text: '', textTruncated: false },
    () => {},
  );
  v.show();
  assert(root.textContent.includes('내용이 없습니다.'));
  assert(!root.textContent.includes('내용 정보를 확인할 수 없습니다.'));
  v.destroy();
});

test('tool forwards fresh body-flow query and opaque target into integrated dialog', async () => {
  const { root } = dom(),
    listeners = new Set(),
    calls = [],
    target = Object.freeze({});
  const token = {
    editorId: 'e',
    documentId: 'd',
    generation: 0,
    operationRevision: 0,
    viewRevision: 0,
  };
  const state = {
    ...token,
    token,
    status: 'ready',
    stateVersion: 1,
    content: {
      format: 'hwpx',
      readOnly: false,
      drawings: [
        {
          section: 0,
          drawingNode: 5,
          hostParagraph: 0,
          anchorUnit: 0,
          source: {
            drawing_node: 5,
            paragraph: 1,
            anchor_unit: 0,
            geometry: { width: 7200, height: 3600, width_relative: 4, height_relative: 2 },
          },
        },
      ],
    },
  };
  const tool = createDrawingPropertiesTool({
    root,
    editor: {
      getEditorState: () => state,
      registerStateListener(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      async getObjectBodyFlow(selector, settings) {
        calls.push({ kind: 'read', selector, settings });
        return {
          state: 'available',
          target,
          observation: {
            format: 'hwpx',
            section: 0,
            drawingNode: 5,
            flow: { textWrap: 'SQUARE', textFlow: 'RIGHT_ONLY' },
          },
        };
      },
      async dispatchCommand(command, payload) {
        calls.push({ kind: 'write', command, payload });
        return { status: 'committed-with-snapshot' };
      },
    },
  });
  tool.open({ section: 0, drawingNode: 5 });
  await new Promise((r) => setImmediate(r));
  assert.equal(calls.filter((v) => v.kind === 'read').length, 1);
  assert.deepEqual(calls[0].selector, { kind: 'drawing', section: 0, node: 5 });
  const side = all(root, (n) => n.dataset.role === 'object-body-flow-side')[0],
    apply = all(root, (n) => n.dataset.role === 'object-body-flow-apply')[0];
  assert.equal(side.value, 'RIGHT_ONLY');
  side.value = 'LEFT_ONLY';
  side.dispatchEvent(new Event('change'));
  apply.dispatchEvent(new Event('click'));
  await new Promise((r) => setImmediate(r));
  assert.equal(calls.filter((v) => v.kind === 'write').length, 1);
  assert.equal(calls.find((v) => v.kind === 'write').payload.target, target);
  assert.equal(root.children.length, 0);
  tool.dispose();
  assert.equal(listeners.size, 0);
});
