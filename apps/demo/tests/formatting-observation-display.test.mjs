import test from 'node:test';
import assert from 'node:assert/strict';
import { formattingObservationLabels, fontNameLabel } from '../src/formatting-observation-label.ts';
const languages = ['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user'];
const names = {
  hangul: '휴먼명조',
  latin: 'HCI Poppy',
  hanja: '한양신명조',
  japanese: '한양신명조',
  other: '한양신명조',
  symbol: '한양신명조',
  user: '명조',
};
function observation(patch = {}) {
  return {
    fontNames: Object.fromEntries(languages.map((l) => [l, { kind: 'single', name: names[l] }])),
    size: 'mixed',
    characterAvailableReason: null,
    ...patch,
  };
}
test('원본 언어 partition은 서로 달라도 한글 이름과 전체 tooltip 표시', () => {
  const p = formattingObservationLabels(observation());
  assert.equal(p.fontName, '휴먼명조');
  assert.equal(p.fontNameLanguage, 'hangul');
  assert.match(p.fontNameTitle, /영문: "HCI Poppy"/);
  assert.match(p.fontNameTitle, /사용자: "명조"/);
  assert.equal(p.fontSizeStatus, 'mixed');
  assert.equal(p.fontSizeHint, '혼합 크기');
});
for (const [value, status, hint] of [
  [1300, 'single', ''],
  [1500, 'single', ''],
  ['mixed', 'mixed', '혼합 크기'],
  [null, 'unknown', '크기 정보 미관측'],
])
  test('원본 크기 관측 ' + value + ' 상태를 기본값 없이 분리', () => {
    const p = formattingObservationLabels(observation({ size: value }));
    assert.equal(p.fontSizeStatus, status);
    assert.equal(p.fontSizeHint, hint);
  });
test('Core 다문단 null/커서/미지원 사유는 크기값으로 보완하지 않음', () => {
  for (const reason of [
    'MissingSelection',
    'EmptyCharacterSelection',
    'FormattingCapabilityUnavailable',
  ]) {
    const p = formattingObservationLabels(
      observation({ size: null, characterAvailableReason: reason }),
    );
    assert.equal(p.fontSizeStatus, 'unavailable');
    assert.notEqual(p.fontSizeHint, '혼합 크기');
    assert.ok(p.fontSizeHint.length);
  }
});
test('한글 mixed/unknown/빈이름/null과 원본 영문 이름을 구분', () => {
  for (const [v, expected] of [
    [{ kind: 'mixed' }, '혼합 글꼴'],
    [{ kind: 'unknown' }, '글꼴 정보 미관측'],
    [{ kind: 'single', name: '' }, '빈 원본 이름'],
    [{ kind: 'single', name: null }, '원본 이름 미관측'],
  ]) {
    const o = observation();
    o.fontNames.hangul = v;
    const p = formattingObservationLabels(o);
    assert.equal(p.fontName, expected);
    assert.match(p.fontNameTitle, /HCI Poppy/);
  }
});
test('기존 글꼴 모달 라벨 함수의 single/mixed/unknown 의미 보존', () => {
  assert.equal(fontNameLabel({ kind: 'single', name: 'A B' }), '"A B"');
  assert.equal(fontNameLabel({ kind: 'single', name: '' }), '빈 원본 이름');
  assert.equal(fontNameLabel({ kind: 'single', name: null }), '원본 이름을 확인할 수 없음');
  assert.equal(fontNameLabel({ kind: 'mixed' }), '서로 다른 글꼴');
  assert.equal(fontNameLabel({ kind: 'unknown' }), '알 수 없음');
});
test('원본 스타일 이름 미관측을 임의 바탕글로 바꾸지 않음', () => {
  assert.equal(formattingObservationLabels(observation()).styleLabel, '스타일 이름 미관측');
});

test('writer readonly 사유와 원 크기 미관측 null의 표시상태는 분리', () => {
  const p = formattingObservationLabels(
    observation({ size: null, characterAvailableReason: 'ReadOnlyDocument' }),
  );
  assert.equal(p.fontSizeStatus, 'unknown');
  assert.equal(p.fontSizeHint, '크기 정보 미관측');
});
