// 정규화 모델 관측의 호출별 비용과 기존 기본 helper 의미만 검사한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rangeFormattingObservation } from '../../../web/preview/range-formatting-observation.mjs';
import { characterRangeValues } from '../../../web/preview/character-range-values.mjs';
import { characterSelectionState } from '../../../web/preview/character-property-selection.mjs';
import { isUtf16Boundary } from '../../../web/preview/utf16-boundary.mjs';
function source(n) {
  const visits = { paragraph: 0, span: 0, height: 0 };
  const paragraphs = Array.from({ length: n }, (_, paragraph) => ({
    get section() {
      visits.paragraph++;
      return 0;
    },
    paragraph,
    text: 'X',
    paragraphShape: { alignment: 1 },
    get characterRanges() {
      visits.span++;
      return [{ start: 0, end: 1, charShapeId: 0 }];
    },
  }));
  const ranges = Array.from({ length: n }, (_, paragraph) => ({
    section: 0,
    paragraph,
    startUnit: 0,
    endUnit: 1,
  }));
  const content = {
    paragraphs,
    characterPropertiesAvailable: true,
    characterShapes: [
      {
        id: 0,
        get height() {
          visits.height++;
          return 1200;
        },
        bold: false,
        italic: true,
      },
    ],
  };
  return { visits, content, ranges };
}
test('선택 문단 증가에서 문단과 span을 선형 방문하고 공통 shape는 한 번 읽는다', () => {
  const measured = [];
  for (const n of [16, 32, 64]) {
    const f = source(n);
    const value = rangeFormattingObservation(f.content, f.ranges);
    assert.equal(value.size, 1200);
    assert.equal(value.bold, false);
    assert.equal(value.italic, true);
    assert.equal(f.visits.span, n);
    assert.equal(f.visits.height, 1);
    assert.ok(f.visits.paragraph <= 4 * n);
    measured.push({ ...f.visits });
  }
  assert.equal(measured[1].paragraph, measured[0].paragraph * 2);
  assert.equal(measured[2].paragraph, measured[1].paragraph * 2);
});
test('호출 사이의 같은 모델 교체는 새 관측에 반영되고 이전 결과는 바뀌지 않는다', () => {
  const f = source(1);
  const before = rangeFormattingObservation(f.content, f.ranges);
  f.content.characterShapes = [{ id: 0, height: 1800, bold: true, italic: false }];
  const after = rangeFormattingObservation(f.content, f.ranges);
  assert.equal(before.size, 1200);
  assert.equal(before.bold, false);
  assert.equal(after.size, 1800);
  assert.equal(after.bold, true);
  assert.ok(Object.isFrozen(before));
});
test('기존 기본 helper는 옵션과 사용자 find를 추가로 관찰하지 않는다', () => {
  const f = source(2);
  const trace = [];
  let finds = 0;
  const original = f.content.paragraphs.find;
  Object.defineProperty(f.content.paragraphs, 'find', {
    get() {
      finds++;
      return original;
    },
  });
  const options = new Proxy(
    { isBoundary: isUtf16Boundary },
    {
      get(target, key) {
        trace.push(key);
        return target[key];
      },
    },
  );
  assert.deepEqual(
    characterRangeValues(f.content, f.ranges, () => true, options),
    [true, true],
  );
  assert.deepEqual(trace, ['isBoundary']);
  assert.equal(finds, 2);
});
test('기존 밑줄 값 조회의 getter 횟수는 한 번으로 유지한다', () => {
  let reads = 0;
  const row = {
    section: 0,
    paragraph: 0,
    text: 'X',
    characterRanges: [{ start: 0, end: 1, charShapeId: 0 }],
  };
  const content = {
    characterUnderlineAvailable: true,
    characterUnderlines: [
      {
        id: 0,
        get kind() {
          reads++;
          return 'bottom';
        },
      },
    ],
  };
  assert.equal(characterSelectionState(content, row, 0, 1, 'underline'), true);
  assert.equal(reads, 1);
});
test('중복 원본 리소스나 잘린 문자 경계는 임의 기본값이 되지 않는다', () => {
  const f = source(1);
  f.content.characterShapes = [
    { id: 0, height: 1200, bold: true },
    { id: 0, height: 1800, bold: false },
  ];
  assert.equal(rangeFormattingObservation(f.content, f.ranges).bold, null);
  f.content.paragraphs = [
    {
      section: 0,
      paragraph: 0,
      text: '😀',
      characterRanges: [{ start: 0, end: 2, charShapeId: 0 }],
    },
  ];
  f.ranges = [{ section: 0, paragraph: 0, startUnit: 1, endUnit: 2 }];
  assert.equal(rangeFormattingObservation(f.content, f.ranges).size, null);
});
