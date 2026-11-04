import test from 'node:test';
import assert from 'node:assert/strict';
import { createObjectPropertiesView } from '../src/object-properties-view.ts';
import { documentFixture, fire } from './formatting-dialog-test-dom.ts';
import { pictureSize } from '../src/object-properties-input.ts';
function setup() {
  const dom = documentFixture(),
    calls = [];
  let dismiss = 0;
  const capture = {
    state: {},
    target: { section: 0, pictureNode: 7, width: 7200, height: 3600 },
    reason: null,
  };
  const view = createObjectPropertiesView(
    dom.root,
    capture,
    { width: '25.4', height: '12.7' },
    {
      onApply(draft) {
        calls.push(draft);
      },
      onDismiss() {
        dismiss++;
      },
    },
  );
  return { ...dom, view, calls, dismissed: () => dismiss };
}
test('실제 공용 모달·단위·접근성·기본 초안은 기존 크기값', () => {
  const h = setup();
  assert.equal(h.role('object-properties').open, true);
  assert.equal(h.role('object-properties').getAttribute('aria-modal'), 'true');
  assert.equal(h.role('object-width').getAttribute('aria-label'), '너비 (mm)');
  assert.equal(h.role('object-height').value, '12.7');
  assert.equal(h.doc.activeElement, h.role('object-width'));
  assert.equal(h.calls.length, 0);
  h.view.destroy();
});
test('유효한 두 축을 확인1회 payload로 전달', () => {
  const h = setup();
  h.role('object-width').value = '50.8';
  fire(h.role('object-width'), 'input');
  fire(h.role('object-apply'), 'click');
  assert.deepEqual(h.calls, [
    { width: '50.8', height: '12.7', dirty: { width: true, height: false } },
  ]);
  h.view.destroy();
});
test('빈 값·음수·과대 숫자는 실제 버튼 경계에서도 거부', () => {
  const h = setup();
  for (const value of ['', '-1', 'NaN', '999999999999']) {
    h.role('object-width').value = value;
    fire(h.role('object-width'), 'input');
    fire(h.role('object-apply'), 'click');
    assert.equal(h.role('object-apply').disabled, true);
  }
  assert.equal(h.calls.length, 0);
  h.view.destroy();
});
test('비율 유지·상한 초과는 원 크기 기준으로 계산하거나 확인 거부', () => {
  const h = setup();
  h.role('object-lock-ratio').checked = true;
  h.role('object-width').value = '50.8';
  fire(h.role('object-width'), 'input');
  assert.equal(h.role('object-height').value, '25.4');
  assert.deepEqual(
    pictureSize({ width: h.role('object-width').value, height: h.role('object-height').value }),
    { width: 14400, height: 7200 },
  );
  h.role('object-height').value = '15000000';
  fire(h.role('object-height'), 'input');
  fire(h.role('object-apply'), 'click');
  assert.equal(h.role('object-apply').disabled, true);
  assert.equal(h.calls.length, 0);
  h.view.destroy();
});
test('IME·229 중 확인/취소 차단, 조합 종료 때 최종 비율 초안 반영', () => {
  const h = setup(),
    layer = h.role('object-properties');
  h.role('object-lock-ratio').checked = true;
  fire(layer, 'compositionstart');
  h.role('object-width').value = '50.8';
  fire(h.role('object-width'), 'input');
  fire(h.role('object-apply'), 'click');
  fire(h.role('object-cancel'), 'click');
  assert.equal(h.calls.length, 0);
  assert.equal(h.dismissed(), 0);
  fire(layer, 'compositionend');
  assert.equal(h.role('object-height').value, '25.4');
  fire(layer, 'keydown', { key: 'Enter', keyCode: 229 });
  fire(h.role('object-apply'), 'click');
  assert.equal(h.calls.length, 0);
  fire(layer, 'keyup');
  fire(h.role('object-apply'), 'click');
  assert.equal(h.calls.length, 1);
  h.view.destroy();
});
test('stale/readonly 사유와 pending은 입력/적용 차단, 닫기를 취소로 오표시 안 함', () => {
  const h = setup();
  h.view.setAvailability('선택이 바뀌었습니다.');
  assert.equal(h.role('object-width').disabled, true);
  fire(h.role('object-apply'), 'click');
  assert.equal(h.calls.length, 0);
  h.view.setAvailability(null);
  h.view.setBusy(true);
  assert.match(h.role('object-cancel').textContent, /적용은 계속/);
  fire(h.role('object-apply'), 'click');
  assert.equal(h.calls.length, 0);
  fire(h.role('object-cancel'), 'click');
  assert.equal(h.dismissed(), 1);
  h.view.destroy();
});
test('동시에 열린 두 editor의 ARIA id는 독립, destroy 뒤 저장 이벤트 무효', () => {
  const a = setup(),
    b = setup();
  const ai = a.role('object-width').getAttribute('aria-describedby');
  const bi = b.role('object-width').getAttribute('aria-describedby');
  assert.notEqual(ai, bi);
  assert.equal(ai, a.role('object-status').id);
  const apply = a.role('object-apply'),
    cancel = a.role('object-cancel');
  a.view.destroy();
  a.view.destroy();
  fire(apply, 'click');
  fire(cancel, 'click');
  assert.equal(a.calls.length, 0);
  assert.equal(a.dismissed(), 0);
  assert.equal(b.role('object-properties').open, true);
  b.view.destroy();
});
test('입력 없이 확인한 UI 초안은 두 축 dirty=false로 전달', () => {
  const h = setup();
  fire(h.role('object-apply'), 'click');
  assert.deepEqual(h.calls[0].dirty, { width: false, height: false });
  h.view.destroy();
});
test('크기 입력 Enter는 확인1회, IME229 Enter는 제출0', () => {
  const h = setup(),
    layer = h.role('object-properties'),
    input = h.role('object-width');
  const enter = (code) => {
    const event = new Event('keydown', { cancelable: true });
    Object.defineProperties(event, {
      target: { value: input },
      key: { value: 'Enter' },
      keyCode: { value: code },
    });
    layer.dispatchEvent(event);
  };
  enter(229);
  assert.equal(h.calls.length, 0);
  fire(layer, 'keyup');
  enter(13);
  assert.equal(h.calls.length, 1);
  h.view.destroy();
});
