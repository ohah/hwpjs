import { test, expect } from 'bun:test';
import { createCharacterShapeView } from '../src/character-shape-view.ts';
import { documentFixture } from './formatting-dialog-test-dom.ts';
function setup(atomic: boolean, legacy: string | null, writable: boolean, reason = 'ReadOnly') {
  const dom = documentFixture();
  const view = createCharacterShapeView(dom.root as any, {
    onDraft() {},
    onLanguage() {},
    onApply() {},
    onDismiss() {},
  });
  const fields = Object.fromEntries(
    ['size', 'bold', 'italic'].map((k) => ['character.' + k, { writable: true }]),
  );
  const aggregate = Object.fromEntries(
    ['size', 'bold', 'italic'].map((k) => [
      'character.' + k,
      { writable: true, state: 'known', value: 1 },
    ]),
  );
  aggregate['character.bold'] = { ...aggregate['character.bold'], writable };
  if (!writable) Object.assign(aggregate['character.bold'], { writeUnavailableReason: reason });
  view.update({
    observation: {
      formatting: {
        characterAvailableReason: legacy,
        textColorAvailableReason: 'Unsupported',
        underlineAvailableReason: 'Unsupported',
        strikeAvailableReason: 'Unsupported',
        fontNameAvailableReasons: {},
        fontNames: {},
        size: 1200,
        bold: false,
        italic: false,
      },
    },
    draft: {},
    language: '',
    pending: false,
    stale: false,
    refreshRequired: false,
    error: null,
    canApply: true,
    atomicDetails: atomic
      ? { capability: { atomic: true, fields }, query: { observations: { aggregate } } }
      : undefined,
  } as any);
  view.show();
  return { dom, view };
}
test('원자 필드별 쓰기 거부는 기존 조회 가능과 무관하게 비활성화한다', () => {
  const { dom, view } = setup(true, null, false);
  expect(dom.role('character-bold').disabled).toBe(true);
  expect((dom.role('character-bold') as unknown as HTMLElement).title).toBe('ReadOnly');
  expect(dom.role('character-size').disabled).toBe(false);
  view.dispose();
});
test('원자 필드 쓰기 허용은 기존 조회 미지원과 구분한다', () => {
  const { dom, view } = setup(true, 'UnsupportedLegacyProjection', true);
  expect(dom.role('character-bold').disabled).toBe(false);
  view.dispose();
});
test('원자 연결이 없으면 기존 읽기 전용 정책을 보존한다', () => {
  const { dom, view } = setup(false, 'ReadOnly', true);
  expect(dom.role('character-bold').disabled).toBe(true);
  view.dispose();
});
