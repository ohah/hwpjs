import { test, expect } from 'bun:test';
import { decorateParagraphAlignmentFallback } from '../src/paragraph-shape-fallback-view.ts';
import { documentFixture, all } from './formatting-dialog-test-dom.ts';
function fixture(kind = 'paragraph') {
  const f = documentFixture();
  const element = f.doc.createElement('dialog'),
    body = f.doc.createElement('div');
  const status = f.doc.createElement('p'),
    input = f.doc.createElement('select');
  status.dataset.role = 'format-dialog-status';
  element.dataset.kind = kind;
  input.value = 'CENTER';
  input.disabled = true;
  body.append(input, status);
  element.append(body);
  f.root.append(element);
  const show = () => {},
    destroy = () => {};
  const view = { element: element as unknown as HTMLDialogElement, show, destroy };
  return { ...f, element, input, view, show, destroy };
}
test('정렬 fallback은 지원 한계를 실제 설명으로 표시하며 추가 입력을 만들지 않는다', () => {
  const f = fixture(),
    before = all(f.root).filter((n) => n.tagName === 'SELECT').length;
  decorateParagraphAlignmentFallback(f.view);
  expect(f.element.dataset.paragraphMode).toBe('alignment-only');
  expect(f.text()).toContain('정렬만 적용');
  expect(f.text()).toContain('이 창에서 변경되지 않습니다');
  expect(all(f.root).filter((n) => n.tagName === 'SELECT').length).toBe(before);
});
test('표현 보강은 기존 값·readonly와 show/destroy 수명을 바꾸지 않는다', () => {
  const f = fixture();
  decorateParagraphAlignmentFallback(f.view);
  expect(f.input.value).toBe('CENTER');
  expect(f.input.disabled).toBe(true);
  expect(f.view.show).toBe(f.show);
  expect(f.view.destroy).toBe(f.destroy);
});
test('글자창에는 문단 한계 표시나 레이아웃을 주입하지 않는다', () => {
  const f = fixture('character');
  decorateParagraphAlignmentFallback(f.view);
  expect(f.element.dataset.paragraphMode).toBeUndefined();
  expect(f.role('paragraph-fallback-scope')).toBeUndefined();
});
test('같은 fallback view를 다시 보강해도 설명 노드를 중복 생성하지 않는다', () => {
  const f = fixture();
  decorateParagraphAlignmentFallback(f.view);
  decorateParagraphAlignmentFallback(f.view);
  expect(all(f.root).filter((n) => n.dataset.role === 'paragraph-fallback-scope')).toHaveLength(1);
});
