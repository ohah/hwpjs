import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDocument } from '../src/render.mjs';
import { createDisplayEscaper } from '../src/render-escape.mjs';

let ordinal = 0;
const paragraph = (displayText) => ({
  id: 'p:' + ordinal++,
  type: 'paragraph',
  displayText,
  source: { section: 0, paragraph: 0 },
  editability: 'unknown',
});
const area = () => ({
  declarations: 'known',
  definitions: [],
  inheritance: { state: 'unresolved' },
});
const model = (body = []) => ({
  version: 1,
  format: 'hwp5',
  sourceSha256: 'a'.repeat(64),
  sections: [{ id: 'section', source: { section: 0 }, header: area(), body, footer: area() }],
  unplaced: [],
  warnings: [],
  coverage: { inventoryComplete: true },
});
const cell = (row, column, blocks = [], extra = {}) => ({
  id: 'c:' + ordinal++,
  row,
  column,
  rowSpan: 1,
  columnSpan: 1,
  geometryKnown: true,
  contentState: 'observed',
  blocks,
  ...extra,
});
const table = (rows, columns, cells) => ({
  id: 't:' + ordinal++,
  type: 'table',
  rows,
  columns,
  cells,
});
const image = (extra = {}) => ({
  id: 'i:' + ordinal++,
  type: 'image',
  altState: 'not-exposed',
  alt: null,
  sourceInfo: { resourceId: 123 },
  ...extra,
});
const render = (value, format = 'text', options = {}) =>
  renderDocument(value, { format, ...options });
const definition = (kind, blocks) => ({
  id: 'd:' + ordinal++,
  kind,
  apply: 'both',
  range: { state: 'unresolved' },
  blocks,
});

test('기본 내용은 원문만 쓰며 구조용 문자열도 원문이면 보존한다', () => {
  const source = 'Paragraph s0:p0 Table Cell documentSHA256: 2026-11-08 (010-1234-5678).';
  const value = model([paragraph(source)]);
  assert.equal(render(value), source + '\n');
  assert.equal(render(value, 'markdown'), source + '\n');
  assert.equal(render(value, 'text', { view: 'content' }), render(value));
  assert.match(render(value, 'text', { view: 'structure' }), /Section section/);
  assert.throws(() => render(value, 'text', { view: 'other' }), /InvalidRenderView/);
});

test('문단과 빈 문단을 유지하고 Markdown 문단은 빈 줄로 나눈다', () => {
  const value = model([paragraph('앞'), paragraph(''), paragraph('뒤')]);
  assert.equal(render(value), '앞\n\n뒤\n');
  assert.equal(render(value, 'markdown'), '앞\n\n\n\n뒤\n');
  assert.equal(render(model([paragraph('')])), '\n');
  assert.equal(render(model([])), '');
});

test('본문 문법·HTML·제어문자를 보호하되 일반 날짜와 전화번호 구두점은 유지한다', () => {
  const cases = [
    ['# 제목', '\\# 제목'],
    ['- 목록', '\\- 목록'],
    ['+ 목록', '\\+ 목록'],
    ['1. 항목', '1\\. 항목'],
    ['2) 항목', '2\\) 항목'],
    ['---', '\\-\\-\\-'],
    ['> 인용', '\\> 인용'],
    ['    코드', '&#32;   코드'],
    ['2026-11-08 (010-1234-5678).', '2026-11-08 (010-1234-5678).'],
    [
      '<script>&copy; | * _ ` [링크](url)',
      '\\<script\\>&amp;copy; \\| \\* \\_ \\` \\[링크\\](url)',
    ],
    ['🙂\u001b\ud800\n', '🙂\\\\u001b\\\\ud800\\\\u000a'],
  ];
  for (const [source, expected] of cases)
    assert.equal(render(model([paragraph(source)]), 'markdown'), expected + '\n');
});

test('머리말·꼬리말은 실제 내용이 있을 때만 표시하고 상속을 복제하지 않는다', () => {
  const value = model([paragraph('본문')]);
  value.sections[0].header.definitions.push(definition('header', [paragraph('머릿글')]));
  value.sections[0].footer.definitions.push(definition('footer', [paragraph('꼬릿글')]));
  assert.equal(render(value), '머리말\n머릿글\n본문\n꼬리말\n꼬릿글\n');
  assert.equal(render(value, 'markdown'), '머리말\n\n머릿글\n\n본문\n\n꼬리말\n\n꼬릿글\n');
  const empty = model([paragraph('본문')]);
  empty.sections[0].header.definitions.push(definition('header', [paragraph('')]));
  assert.equal(render(empty).includes('머리말'), false);
  assert.equal(render(empty).includes('inheritance'), false);
});

test('이미지는 관측된 대체 설명 또는 이미지 표식만 노출한다', () => {
  const value = model([
    image(),
    image({ altState: 'provided', alt: '관측 설명' }),
    image({ altState: 'not-provided', alt: '노출하지 않을 값' }),
    image({ altState: 'provided', alt: '' }),
  ]);
  assert.equal(render(value), '[이미지]\n관측 설명\n[이미지]\n[이미지]\n');
  assert.equal(render(value).includes('123'), false);
});

test('완전히 관측된 단순표만 좌표 순서로 쓰고 첫 데이터행을 헤더로 승격하지 않는다', () => {
  const value = model([
    table(2, 2, [
      cell(1, 1, [paragraph('D')]),
      cell(0, 1, [paragraph('B')]),
      cell(1, 0, [paragraph('C')]),
      cell(0, 0, [paragraph('A')]),
    ]),
  ]);
  assert.equal(render(value), 'A\tB\nC\tD\n');
  assert.equal(render(value, 'markdown'), '|  |  |\n| --- | --- |\n| A | B |\n| C | D |\n');
});

test('표 안 여러 문단은 안전한 구분자를 쓰고 앞뒤 문단과 표를 구분한다', () => {
  const value = model([
    paragraph('앞'),
    table(1, 1, [cell(0, 0, [paragraph('a|<br>'), paragraph(''), paragraph('b')])]),
    paragraph('뒤'),
  ]);
  assert.equal(render(value), '앞\na|<br> /  / b\n뒤\n');
  assert.equal(
    render(value, 'markdown'),
    '앞\n\n|  |\n| --- |\n| a\\|\\<br\\><br><br><br><br>b |\n\n뒤\n',
  );
});

test('희소·거대·병합·중복·범위밖·미관측 기하는 관측 셀만 표시한다', () => {
  const variants = [
    [4_000_000_000, 4_000_000_000, {}],
    [1, 1, { rowSpan: 2 }],
    [1, 1, { column: 1 }],
    [1, 1, { row: null, geometryKnown: false }],
    [1, 1, { contentState: 'not-observed' }],
  ];
  for (const [rows, columns, extra] of variants) {
    const out = render(model([table(rows, columns, [cell(0, 0, [paragraph('유일내용')], extra)])]));
    assert.match(out, /표 배치를 단순화/);
    assert.equal(out.split('유일내용').length, 2);
    assert.ok(out.length < 300);
  }
  const duplicate = model([
    table(1, 2, [cell(0, 0, [paragraph('A')]), cell(0, 0, [paragraph('B')])]),
  ]);
  assert.match(render(duplicate), /표 배치를 단순화/);
  assert.match(render(model([table(0, 0, [])])), /관측된 셀 없음/);
});

test('중첩표와 행병합은 텍스트를 복제하지 않고 경계를 드러낸다', () => {
  const inner = table(1, 1, [cell(0, 0, [paragraph('중첩본문')])]);
  const value = model([
    table(2, 2, [
      cell(0, 0, [paragraph('병합본문'), inner], { rowSpan: 2 }),
      cell(0, 1, [paragraph('우측')]),
    ]),
  ]);
  for (const format of ['text', 'markdown']) {
    const out = render(value, format);
    assert.equal(out.split('병합본문').length, 2);
    assert.equal(out.split('중첩본문').length, 2);
    assert.match(out, /표 배치를 단순화/);
    assert.equal(out.includes('[셀 경계]'), false);
    assert.equal(out.includes('[관측된 행]'), false);
  }
});

test('미관측 문단·미지원·미배치·실패는 짧은 표식으로 보존한다', () => {
  const value = model([
    paragraph(null),
    {
      id: 'unknown',
      type: 'unknown',
      kind: 'native',
      diagnostic: { code: 'secret-code', message: 'secret-message' },
    },
  ]);
  value.unplaced.push({
    block: paragraph('위치 없는 실제내용'),
    diagnostic: { code: 'unplaced-code', message: 'message' },
  });
  value.sections[0].header.declarations = 'unavailable';
  value.coverage.inventoryComplete = false;
  value.warnings.push({ code: 'warning-code', message: 'message' });
  const out = render(value);
  for (const text of [
    '문단 내용 확인 불가',
    '알 수 없는 내용',
    '위치를 확인할 수 없는 내용',
    '위치 없는 실제내용',
    '머리말 확인 불가',
    '관측이 불완전',
  ])
    assert.ok(out.includes(text));
  assert.equal(out.includes('secret-'), false);
  assert.equal(out.includes('warning-code'), false);
});

test('내용 모드도 전체 검증과 실제 이스케이프 출력 예산을 적용한다', () => {
  const value = model([paragraph('a')]);
  assert.equal(render(value, 'text', { maxOutputUnits: 2 }), 'a\n');
  assert.throws(() => render(value, 'text', { maxOutputUnits: 1 }), /RenderOutputLimitExceeded/);
  assert.throws(
    () => render(model([paragraph('<')]), 'markdown', { maxOutputUnits: 2 }),
    /RenderOutputLimitExceeded/,
  );
  const invalid = model([paragraph('a')]);
  invalid.sections[0].body.push({ ...paragraph('b'), id: invalid.sections[0].body[0].id });
  assert.throws(() => render(invalid), /DuplicateOrEmptyRenderId/);
  assert.throws(
    () => render(model([paragraph('a')]), 'text', { maxNodes: 1 }),
    /RenderNodeLimitExceeded/,
  );
  assert.throws(
    () => render(model([paragraph('a')]), 'text', { maxTextUnits: 1 }),
    /RenderTextLimitExceeded/,
  );
});

test('입력 동결 모델을 변경하지 않으며 원시 텍스트 대체값을 읽지 않는다', () => {
  const block = paragraph(null);
  Object.defineProperty(block, 'text', {
    get() {
      throw new Error('읽으면 안 되는 원시 값');
    },
  });
  const value = model([block]);
  const freeze = (object) => {
    for (const child of Object.values(object))
      if (child && typeof child === 'object') freeze(child);
    Object.freeze(object);
  };
  freeze(value);
  assert.equal(render(value), '[문단 내용 확인 불가]\n');
});

test('작은 병합 3×4 표는 전체 덮임을 증명한 슬롯만 비우고 본문을 복제하지 않는다', () => {
  const value = model([
    table(3, 4, [
      cell(0, 0, [paragraph('병합')], { rowSpan: 2, columnSpan: 2 }),
      cell(0, 2, [paragraph('가')]),
      cell(0, 3, [paragraph('나')]),
      cell(1, 2, [paragraph('다')]),
      cell(1, 3, [paragraph('라')]),
      cell(2, 0, [paragraph('마')]),
      cell(2, 1, [paragraph('바')]),
      cell(2, 2, [paragraph('사')]),
      cell(2, 3, [paragraph('아')]),
    ]),
  ]);
  assert.equal(render(value), '병합\t\t가\t나\n\t\t다\t라\n마\t바\t사\t아\n');
  assert.equal(
    render(value, 'markdown'),
    '|  |  |  |  |\n| --- | --- | --- | --- |\n| 병합 |  | 가 | 나 |\n|  |  | 다 | 라 |\n| 마 | 바 | 사 | 아 |\n',
  );
});

test('병합의 구멍·겹침·과도한 슬롯 확장은 빈 내용으로 위장하지 않는다', () => {
  const cases = [
    table(2, 2, [cell(0, 0, [paragraph('구멍')], { columnSpan: 2 })]),
    table(1, 2, [
      cell(0, 0, [paragraph('겹침')], { columnSpan: 2 }),
      cell(0, 1, [paragraph('두번째')]),
    ]),
    table(1, 9, [cell(0, 0, [paragraph('상수배 제한')], { columnSpan: 9 })]),
    table(1, 4097, [cell(0, 0, [paragraph('절대 제한')], { columnSpan: 4097 })]),
  ];
  for (const value of cases) {
    const out = render(model([value]), 'markdown');
    assert.match(out, /표 배치를 단순화/);
    assert.equal(out.includes('| ---'), false);
    assert.ok(out.length < 150);
  }
});

test('큰 복합표의 표식은 표당 한 번이고 관측 본문은 원문 셀 순서를 유지한다', () => {
  const value = model([
    table(4_000_000_000, 4_000_000_000, [
      cell(99, 8, [paragraph('먼저')], { rowSpan: 10 }),
      cell(1, 0, [paragraph('나중')]),
      cell(99, 9, [paragraph('마지막')]),
    ]),
  ]);
  const out = render(value);
  assert.equal(out, '[표 배치를 단순화했습니다: 관측된 내용 순서]\n먼저\n나중\n마지막\n');
});

test('인접한 Markdown 표 사이에도 빈 줄을 두고 표 내부에는 삽입하지 않는다', () => {
  const value = model([
    table(1, 1, [cell(0, 0, [paragraph('A')])]),
    table(1, 1, [cell(0, 0, [paragraph('B')])]),
  ]);
  assert.equal(render(value, 'markdown'), '|  |\n| --- |\n| A |\n\n|  |\n| --- |\n| B |\n');
});

test('작은 격자 조합의 병합·역순 입력에서 관측 앵커만 한 번 출력한다', () => {
  for (let rows = 1; rows <= 5; rows++) {
    for (let columns = 1; columns <= 5; columns++) {
      const cells = [];
      const expected = [];
      for (let row = 0; row < rows; row++) {
        const values = [];
        for (let column = 0; column < columns;) {
          const span = column + 1 < columns && (row + column) % 3 === 0 ? 2 : 1;
          const text = '좌표본문' + row + ':' + column;
          cells.push(cell(row, column, [paragraph(text)], { columnSpan: span }));
          values.push(text);
          if (span === 2) values.push('');
          column += span;
        }
        expected.push(values.join('\t'));
      }
      assert.equal(
        render(model([table(rows, columns, cells.reverse())])),
        expected.join('\n') + '\n',
      );
    }
  }
});

test('내용 출력 예산은 표·문단 구분·HTML 구분자·실패 표식까지 정확히 계산한다', () => {
  const value = model([
    paragraph('<&'),
    table(1, 1, [cell(0, 0, [paragraph('|'), paragraph('두번째')])]),
    image(),
  ]);
  value.coverage.inventoryComplete = false;
  for (const format of ['text', 'markdown']) {
    const expected = render(value, format);
    assert.equal(render(value, format, { maxOutputUnits: expected.length }), expected);
    assert.throws(
      () => render(value, format, { maxOutputUnits: expected.length - 1 }),
      /RenderOutputLimitExceeded/,
    );
  }
});

test('넓은 완전 관측 표도 정렬 없이 출력하며 출력 한도 초과를 거부한다', () => {
  const cells = [];
  for (let row = 0; row < 64; row++)
    for (let column = 0; column < 64; column++) cells.push(cell(row, column, [paragraph('값')]));
  const value = model([table(64, 64, cells.reverse())]);
  const originalSort = Array.prototype.sort;
  let out;
  try {
    Array.prototype.sort = () => {
      throw new Error('정렬 금지');
    };
    out = render(value);
  } finally {
    Array.prototype.sort = originalSort;
  }
  assert.equal(out, (Array(64).fill('값').join('\t') + '\n').repeat(64));
  assert.throws(
    () => render(value, 'markdown', { maxOutputUnits: 100 }),
    /RenderOutputLimitExceeded/,
  );
});

test('내용 모드도 중첩 깊이·순환·미지원 스키마를 완화하지 않는다', () => {
  let block = paragraph('깊은 실제본문');
  for (let i = 0; i < 10; i++) block = table(1, 1, [cell(0, 0, [block])]);
  const value = model([block]);
  assert.equal(render(value).split('깊은 실제본문').length, 2);
  assert.throws(() => render(value, 'text', { maxDepth: 4 }), /RenderDepthLimitExceeded/);
  const circular = table(1, 1, []);
  circular.cells.push(cell(0, 0, [circular]));
  assert.throws(() => render(model([circular])), /RepeatedRenderNodeOrCycle/);
  assert.throws(
    () => render(model([{ id: 'invalid', type: 'unexpected' }])),
    /UnsupportedRenderBlockType/,
  );
});

test('공통 표시 factory는 형식·보기·문자열만 허용하고 암묵적 변환을 하지 않는다', () => {
  for (const options of [undefined, null, [], 'text', {}, { format: 'html' }])
    assert.throws(() => createDisplayEscaper(options), /InvalidRenderFormat/);
  for (const view of [null, false, '', 'other'])
    assert.throws(() => createDisplayEscaper({ format: 'text', view }), /InvalidRenderView/);
  const escape = createDisplayEscaper({ format: 'text' });
  const object = {
    toString() {
      throw new Error('암묵적 변환 금지');
    },
  };
  for (const input of [undefined, null, 1, false, [], object, new String('문자열 객체')])
    assert.throws(() => escape(input), /InvalidRenderString/);
  assert.equal(escape(''), '');
});

test('공통 표시 factory는 파일명·메시지의 HTML·C1·bidi·고립 surrogate를 같은 정책으로 보호한다', () => {
  const source = '<img src=x>&copy;\u0085\u009b\u202e\u2066\ud800🙂';
  const text = '\\u0085\\u009b\\u202e\\u2066\\ud800🙂';
  const expectedMarkdown = '\\<img src=x\\>&amp;copy;' + text.replace(/\\/gu, '\\\\');
  for (const view of ['content', 'structure']) {
    const escape = createDisplayEscaper({ format: 'text', view });
    assert.equal(escape(source), '<img src=x>&copy;' + text);
    assert.equal(escape(source), escape(source));
  }
  const escape = createDisplayEscaper({ format: 'markdown' });
  assert.equal(escape(source), expectedMarkdown);
  assert.equal(render(model([paragraph(source)]), 'markdown'), escape(source) + '\n');
  assert.equal(
    createDisplayEscaper({ format: 'markdown', view: 'structure' })('2026-11-08 (전화).'),
    '2026\\-11\\-08 \\(전화\\)\\.',
  );
});

test('공통 표시 factory 재사용은 줄 시작 보호와 날짜 구두점 정책을 바꾸지 않는다', () => {
  const escape = createDisplayEscaper({ format: 'markdown', view: 'content' });
  for (let i = 0; i < 3; i++) {
    assert.equal(escape('# 제목'), '\\# 제목');
    assert.equal(escape('2026-11-08 (010-1234-5678).'), '2026-11-08 (010-1234-5678).');
    assert.equal(escape('1. 원문'), '1\\. 원문');
    assert.equal(
      escape('Paragraph s0:p0 Table Cell documentSHA256:'),
      'Paragraph s0:p0 Table Cell documentSHA256:',
    );
  }
});

test('단독 목록 마커는 공백 없이 끝나도 Markdown 내용에서 문자로 보호한다', () => {
  const escape = createDisplayEscaper({ format: 'markdown' });
  const markers = [
    ['-', '\\-'],
    ['+', '\\+'],
    ['1.', '1\\.'],
    ['1)', '1\\)'],
    ['0.', '0\\.'],
    ['999999999)', '999999999\\)'],
  ];
  for (let spaces = 0; spaces <= 3; spaces++) {
    const indent = ' '.repeat(spaces);
    for (const [source, expected] of markers) {
      assert.equal(escape(indent + source), indent + expected);
      assert.equal(createDisplayEscaper({ format: 'text' })(indent + source), indent + source);
    }
  }
  for (const source of ['-3', '+3', '1.2', '1)본문', '1234567890.', '2026-11-08'])
    assert.equal(escape(source), source);
});

test('단독 목록 마커 문단과 연속 문단은 목록 의미를 만들지 않고 원본 모델을 보존한다', () => {
  const sources = ['-', '+', '1.', '1)', '  -'];
  const expected = ['\\-', '\\+', '1\\.', '1\\)', '  \\-'];
  for (let i = 0; i < sources.length; i++) {
    const value = model([paragraph(sources[i])]);
    const original = structuredClone(value);
    assert.equal(render(value, 'markdown'), expected[i] + '\n');
    assert.equal(render(value), sources[i] + '\n');
    assert.deepEqual(value, original);
  }
  const value = model(sources.map(paragraph));
  const original = structuredClone(value);
  assert.equal(render(value, 'markdown'), expected.join('\n\n') + '\n');
  assert.equal(render(value), sources.join('\n') + '\n');
  assert.deepEqual(value, original);
});
