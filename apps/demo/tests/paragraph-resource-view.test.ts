import { test, expect } from 'bun:test';
import { createParagraphShapeView } from '../src/paragraph-shape-view.ts';
import { documentFixture, fire } from './formatting-dialog-test-dom.ts';
function setup() {
  const f = documentFixture();
  const calls = { apply: 0, cancel: 0 };
  const view = createParagraphShapeView(f.root as any, {
    field() {},
    apply() {
      calls.apply++;
    },
    cancel() {
      calls.cancel++;
    },
  });
  const values = {
    'paragraph.border': { state: 'known', value: {}, writable: true },
    'paragraph.background': { state: 'known', value: { kind: 'none' }, writable: true },
  };
  const model: any = {
    captured: {
      capabilities: {
        atomic: true,
        fields: {
          'paragraph.border': { writable: true },
          'paragraph.background': { writable: true },
        },
      },
      result: { observations: { aggregate: values } },
    },
    draft: new Map([['paragraph.border', { left: { color: 0 } }]]),
    pending: false,
    loading: false,
    stale: false,
    refreshRequired: false,
    error: null,
  };
  view.update(model);
  return { f, view, calls, model };
}
test('actual view Enter and IME229 callback boundary', () => {
  const s = setup();
  const dialog = s.f.role('paragraph-shape-dialog');
  fire(dialog, 'keydown', { key: 'Enter', keyCode: 229 });
  expect(s.calls.apply).toBe(0);
  fire(dialog, 'keydown', { key: 'Enter' });
  expect(s.calls.apply).toBe(1);
  s.view.dispose();
});
test('actual view composition and Escape callback boundary', () => {
  const s = setup();
  const dialog = s.f.role('paragraph-shape-dialog');
  fire(dialog, 'compositionstart');
  fire(dialog, 'keydown', { key: 'Escape' });
  expect(s.calls.cancel).toBe(0);
  fire(dialog, 'compositionend');
  fire(dialog, 'keydown', { key: 'Escape' });
  expect(s.calls.cancel).toBe(1);
  s.view.dispose();
});
test('actual view invalid object draft blocks apply', () => {
  const s = setup();
  s.view.update({
    ...s.model,
    draft: new Map([['paragraph.background', { resourceDraft: 'invalid', reason: 'invalid' }]]),
  });
  expect(s.f.role('paragraph-shape-apply').disabled).toBe(true);
  s.view.dispose();
});

test('모형 DOM Tab 순회는 마지막에서 첫 컨트롤로 돌아온다', () => {
  const s = setup();
  const dialog = s.f.role('paragraph-shape-dialog');
  const first = dialog.querySelectorAll('button,input,select')[0];
  s.f.role('paragraph-shape-cancel').focus();
  fire(dialog, 'keydown', { key: 'Tab', shiftKey: false });
  expect(s.f.doc.activeElement).toBe(first);
  s.view.dispose();
});
