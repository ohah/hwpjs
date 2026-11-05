import { expect, test } from 'bun:test';
import { createSymbolDialog } from '../src/symbol-dialog-view.ts';
import { documentFixture, fire, all } from './formatting-dialog-test-dom.ts';
function setup() {
  const dom = documentFixture(),
    inserts: string[] = [];
  let cancels = 0;
  const view = createSymbolDialog(dom.root as any, {
    onInsert: (text) => {
      inserts.push(text);
    },
    onDismiss: () => {
      cancels++;
    },
  });
  const glyph = (text: string) =>
    all(dom.root).find((n) => n.tagName === 'BUTTON' && n.textContent === text)!;
  return {
    ...dom,
    view,
    inserts,
    glyph,
    get cancels() {
      return cancels;
    },
  };
}
test('공식 초기 빈 버퍼·넣기 비활성·입력란 focus', () => {
  const f = setup();
  expect(f.role('symbol-text').value).toBe('');
  expect(f.role('symbol-insert').disabled).toBe(true);
  expect(f.doc.activeElement).toBe(f.role('symbol-text'));
  f.view.destroy();
});
test('두 개의 독립 click은 누적만 하고 문서 삽입은 넣기 한 번이다', () => {
  const f = setup();
  fire(f.glyph('※'), 'click');
  expect(f.role('symbol-text').value).toBe('※');
  fire(f.glyph('※'), 'click');
  expect(f.role('symbol-text').value).toBe('※※');
  expect(f.inserts).toEqual([]);
  fire(f.role('symbol-insert'), 'click');
  expect(f.inserts).toEqual(['※※']);
  f.view.destroy();
});
test('선택 문자와 직접 입력 버퍼는 별도이며 click은 기존 버퍼를 유지한다', () => {
  const f = setup();
  const input = f.role('symbol-text');
  input.value = 'e\u0301😀';
  fire(input, 'input');
  f.role('symbol-category').value = 'miscellaneous-symbols';
  fire(f.role('symbol-category'), 'change');
  fire(f.glyph('★'), 'click');
  expect(input.value).toBe('e\u0301😀★');
  expect(f.role('symbol-selected').textContent).toBe('★');
  expect(f.role('symbol-codepoints').textContent).toContain('U+1F600');
  f.view.destroy();
});
test('범주 변경은 입력한 문자를 비우지 않는다', () => {
  const f = setup();
  fire(f.glyph('※'), 'click');
  f.role('symbol-category').value = 'arrows';
  fire(f.role('symbol-category'), 'change');
  expect(f.role('symbol-text').value).toBe('※');
  fire(f.glyph('←'), 'click');
  expect(f.role('symbol-text').value).toBe('※←');
  f.view.destroy();
});
test('64 UTF16 경계를 넘는 glyph는 버퍼를 자르거나 서로게이트를 나누지 않는다', () => {
  const f = setup();
  const input = f.role('symbol-text');
  input.value = 'a'.repeat(63);
  fire(input, 'input');
  f.role('symbol-category').value = 'miscellaneous-symbols';
  fire(f.role('symbol-category'), 'change');
  fire(f.glyph('😀'), 'click');
  expect(input.value).toBe('a'.repeat(63));
  expect(f.role('symbol-status').textContent).not.toBe('');
  f.role('symbol-category').value = 'general-punctuation';
  fire(f.role('symbol-category'), 'change');
  fire(f.glyph('※'), 'click');
  expect(input.value.length).toBe(64);
  fire(f.glyph('※'), 'click');
  expect(input.value.length).toBe(64);
  f.view.destroy();
});
test('IME 조합 중 glyph click은 버퍼와 선택 문자를 바꾸지 않는다', () => {
  const f = setup();
  fire(f.role('symbol-dialog'), 'compositionstart');
  fire(f.glyph('※'), 'click');
  expect(f.role('symbol-text').value).toBe('');
  expect(f.role('symbol-selected').textContent).toBe('');
  fire(f.role('symbol-dialog'), 'compositionend');
  fire(f.glyph('※'), 'click');
  expect(f.role('symbol-text').value).toBe('※');
  f.view.destroy();
});
test('대기·readonly·취소 경계는 문서 삽입을 만들지 않는다', () => {
  const f = setup();
  f.view.setBusy(true);
  fire(f.glyph('※'), 'click');
  expect(f.role('symbol-text').value).toBe('');
  f.view.setBusy(false);
  fire(f.glyph('※'), 'click');
  f.view.setAvailability('읽기 전용 문서입니다.');
  fire(f.role('symbol-insert'), 'click');
  fire(f.role('symbol-cancel'), 'click');
  expect(f.inserts).toEqual([]);
  expect(f.cancels).toBe(1);
  f.view.destroy();
});
