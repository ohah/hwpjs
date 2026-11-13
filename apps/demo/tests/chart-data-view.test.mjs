import test from 'node:test';
import assert from 'node:assert/strict';
import { installFormattingTestStyles } from './formatting-style-preload.mjs';
import { documentFixture, fire, all } from './formatting-dialog-test-dom.ts';
import { fixture } from './chart-data-fixture.mjs';
const hooks = installFormattingTestStyles();
const { chartDataViewFactory } = await import('../src/chart-data-view.ts');
hooks.deregister();
function setup() {
  const dom = documentFixture(),
    calls = [];
  let dismissed = 0;
  // Extend only the event fixture's missing DOM operation; this is not a browser.
  const original = dom.doc.createElement;
  dom.doc.createElement = (tag) => {
    const element = original(tag);
    element.replaceChildren = (...nodes) => {
      for (const child of element.children) child.remove();
      element.append(...nodes);
    };
    return element;
  };
  const view = chartDataViewFactory(dom.root)([{ section: 0, wrapper: 7 }], {
    onSelect(t) {
      calls.push(['select', t]);
    },
    onApply(v) {
      calls.push(['apply', v]);
    },
    onDismiss() {
      dismissed++;
    },
  });
  const nodes = () => all(dom.root);
  const apply = nodes().find((n) => n.textContent === '변경 일괄 적용');
  return { ...dom, view, calls, apply, nodes, dismissed: () => dismissed };
}
test('modal is existing-data editing; apply disabled until eligible query capture', async () => {
  const f = setup();
  assert.equal(f.role('chart-data').getAttribute('aria-label'), '기존 차트 데이터 편집');
  assert.equal(f.role('chart-data').getAttribute('aria-modal'), 'true');
  assert.equal(f.apply.disabled, true);
  const capture = await fixture().port.capture({ section: 0, wrapper: 7 });
  f.view.showCapture(capture);
  assert.equal(f.apply.disabled, false);
  const inputs = f.nodes().filter((n) => n.tagName === 'INPUT');
  assert.deepEqual(
    inputs.map((n) => n.value),
    ['1', '범주', '?'],
  );
  assert.equal(inputs[2].disabled, true);
  inputs[0].value = '2';
  fire(f.apply, 'click');
  assert.deepEqual(f.calls, [['apply', ['2', '범주', '?']]]);
  f.view.destroy();
});
test('busy/stale/composition events suppress edits and escape while composing', async () => {
  const f = setup(),
    capture = await fixture().port.capture({ section: 0, wrapper: 7 });
  f.view.showCapture(capture);
  f.view.setBusy(true);
  fire(f.apply, 'click');
  assert.equal(f.calls.length, 0);
  f.view.setBusy(false);
  fire(f.role('chart-data'), 'compositionstart');
  fire(f.apply, 'click');
  fire(f.role('chart-data'), 'keydown', { key: 'Escape', isComposing: true });
  assert.equal(f.calls.length, 0);
  assert.equal(f.dismissed(), 0);
  fire(f.role('chart-data'), 'compositionend');
  assert.equal(f.apply.disabled, false);
  f.view.invalidate();
  assert.equal(f.apply.disabled, true);
  fire(f.apply, 'click');
  assert.equal(f.calls.length, 0);
  f.view.destroy();
});
test('destroy removes callbacks and raw source labels stay text', async () => {
  const f = setup(),
    capture = await fixture().port.capture({ section: 0, wrapper: 7 });
  f.view.showCapture({
    ...capture,
    points: [{ kind: 'string_cache', value: '<img src=x onerror=alert(1)>' }],
  });
  assert.equal(
    f.nodes().filter((n) => n.tagName === 'INPUT')[0].value,
    '<img src=x onerror=alert(1)>',
  );
  f.view.destroy();
  fire(f.apply, 'click');
  assert.equal(f.calls.length, 0);
  assert.equal(f.root.children.length, 0);
});
